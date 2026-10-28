import { Bot, Context, InlineKeyboard } from "grammy";
import type { FilePartInput, TextPartInput } from "@opencode-ai/sdk/v2";
import { projectDirectoryExists } from "../../project/directory.js";
import { opencodeClient, opencodeServerVersion, probeOpencodeServer } from "../../opencode/client.js";
import { classifyPromptSubmitError } from "../../opencode/prompt-submit-error.js";
import { clearSession, getCurrentSession, setCurrentSession } from "../../session/manager.js";
import { markForwardedPrompt, unmarkForwardedPrompt } from "../../session/forwarded-prompts.js";
import { ingestSessionInfoForCache } from "../../session/cache-manager.js";
import {
  getCurrentProject,
  getPersistedQueuedPrompts,
  isTtsEnabled,
  setCurrentModel,
  setPersistedQueuedPrompts,
  type PersistedQueuedPrompt,
} from "../../settings/manager.js";
import { getStoredAgent, resolveProjectAgent } from "../../agent/manager.js";
import { getStoredModel } from "../../model/manager.js";
import type { ModelInfo } from "../../model/types.js";
import { formatVariantForButton } from "../../variant/manager.js";
import { createMainKeyboard } from "../utils/keyboard.js";
import { keyboardManager } from "../../keyboard/manager.js";
import { pinnedMessageManager } from "../../pinned/manager.js";
import { summaryAggregator } from "../../summary/aggregator.js";
import { interactionManager } from "../../interaction/manager.js";
import { clearAllInteractionState } from "../../interaction/cleanup.js";
import { safeBackgroundTask } from "../../utils/safe-background-task.js";
import { formatErrorDetails } from "../../utils/error-format.js";
import { logger } from "../../utils/logger.js";
import { t } from "../../i18n/index.js";
import {
  GLOBAL_SCOPE_KEY,
  SCOPE_CONTEXT,
  getScopeFromContext,
  getThreadSendOptions,
} from "../scope.js";
import { BOT_I18N_KEY, CHAT_TYPE } from "../constants.js";
import { INTERACTION_CLEAR_REASON } from "../../interaction/constants.js";
import { getTopicBindingByScopeKey } from "../../topic/manager.js";
import { isEphemeralTopicScope } from "./subagent-topics.js";
import { getScheduledTaskTopicByChatAndThread } from "../../scheduled-task/store.js";
import { assistantRunState } from "../assistant-run-state.js";

/** Module-level references for async callbacks that don't have ctx. */
let botInstance: Bot<Context> | null = null;
let chatIdInstance: number | null = null;

type PromptRequestOptions = {
  sessionID: string;
  directory: string;
  parts: Array<TextPartInput | FilePartInput>;
  model?: { providerID: string; modelID: string };
  agent?: string;
  variant?: string;
};

export type PromptResponseMode = "text_only" | "text_and_tts";

type ProcessPromptOptions = {
  responseMode?: PromptResponseMode;
};

type PromptErrorLogContext = {
  sessionId: string;
  directory: string;
  agent: string;
  modelProvider: string;
  modelId: string;
  variant: string;
  promptLength: number;
  fileCount: number;
};

type StoredPromptModel = {
  providerID?: string | null;
  modelID?: string | null;
  variant?: string | null;
};

type LiveSessionModel = {
  providerID?: string | null;
  id?: string | null;
  modelID?: string | null;
  variant?: string | null;
};

type LiveSessionWithSelection = {
  model?: LiveSessionModel | null;
};

interface QueuedPromptRequest {
  queueId: string;
  sessionId: string;
  chatId: number;
  threadId: number | null;
  responseMode: PromptResponseMode;
  promptOptions: PromptRequestOptions;
  promptErrorLogContext: PromptErrorLogContext;
  notifyOnQueue: boolean;
}

export const QUEUED_PROMPT_CANCEL_PREFIX = "queue:cancel:";
export const QUEUED_PROMPT_STEER_PREFIX = "queue:steer:";
export const QUEUED_PROMPT_FRONT_PREFIX = "queue:front:";

const queuedPromptRequests = new Map<string, QueuedPromptRequest[]>();
const drainingQueuedSessions = new Set<string>();
const activePromptResponseModes = new Map<string, PromptResponseMode>();
let queuedPromptSequence = Math.floor(Math.random() * 1_000_000);

/** Caps for what survives a restart on disk. */
const MAX_PERSISTED_QUEUE_PER_SESSION = 25;
const MAX_PERSISTED_PARTS_BYTES = 2 * 1024 * 1024;

function createQueuedPromptId(): string {
  queuedPromptSequence += 1;
  return `q${Date.now().toString(36)}${queuedPromptSequence.toString(36)}`;
}

function withQueuedPromptId(
  request: Omit<QueuedPromptRequest, "queueId"> & { queueId?: string },
): QueuedPromptRequest {
  return { ...request, queueId: request.queueId ?? createQueuedPromptId() };
}

// If OpenCode headless/server mode gains a native per-session queue later, prefer that
// over this bot-side queue so Telegram matches the upstream client behavior more closely.
const QUEUED_PROMPT_PREVIEW_MAX_LENGTH = 280;

export function getPromptBotInstance(): Bot<Context> | null {
  return botInstance;
}

export function getPromptChatId(): number | null {
  return chatIdInstance;
}

function getQueuedPromptCount(sessionId: string): number {
  return queuedPromptRequests.get(sessionId)?.length ?? 0;
}

function enqueuePromptRequest(request: QueuedPromptRequest): number {
  const keyedRequest = request.queueId ? request : withQueuedPromptId(request);
  if (!request.queueId) {
    request.queueId = keyedRequest.queueId;
  }
  const queue = queuedPromptRequests.get(keyedRequest.sessionId) ?? [];
  // A busy re-enqueue carries the same queueId: refresh it in place instead
  // of stacking a duplicate the cancel/front/steer buttons can't address.
  const existingIndex = queue.findIndex((entry) => entry.queueId === keyedRequest.queueId);
  if (existingIndex >= 0) {
    queue[existingIndex] = keyedRequest;
  } else {
    queue.push(keyedRequest);
  }
  // Bound in-memory growth: persistence already caps at
  // MAX_PERSISTED_QUEUE_PER_SESSION, so anything past double that would
  // never survive a restart anyway. Drop oldest first, loudly.
  if (queue.length > MAX_PERSISTED_QUEUE_PER_SESSION * 2) {
    const dropped = queue.splice(0, queue.length - MAX_PERSISTED_QUEUE_PER_SESSION * 2);
    logger.warn(
      `[Bot] Prompt queue overflow, dropped ${dropped.length} oldest prompt(s): session=${keyedRequest.sessionId}`,
    );
  }
  queuedPromptRequests.set(keyedRequest.sessionId, queue);
  persistQueuedPrompts();
  return queue.length;
}

/** Writes the in-memory queue to settings so it survives bot restarts. */
function persistQueuedPrompts(): void {
  const record: Record<string, PersistedQueuedPrompt[]> = {};

  for (const [sessionId, queue] of queuedPromptRequests) {
    const kept: PersistedQueuedPrompt[] = [];

    for (const request of queue.slice(0, MAX_PERSISTED_QUEUE_PER_SESSION)) {
      let serializedParts: string;
      try {
        serializedParts = JSON.stringify(request.promptOptions.parts);
      } catch {
        logger.warn(`[Bot] Skipping unserializable queued prompt for persistence: session=${sessionId}`);
        continue;
      }

      if (serializedParts.length > MAX_PERSISTED_PARTS_BYTES) {
        logger.warn(
          `[Bot] Skipping oversized queued prompt for persistence: session=${sessionId}, bytes=${serializedParts.length}`,
        );
        continue;
      }

      kept.push({
        queueId: request.queueId,
        sessionId: request.sessionId,
        chatId: request.chatId,
        threadId: request.threadId,
        responseMode: request.responseMode,
        promptOptions: {
          sessionID: request.promptOptions.sessionID,
          directory: request.promptOptions.directory,
          parts: request.promptOptions.parts as PersistedQueuedPrompt["promptOptions"]["parts"],
          ...(request.promptOptions.model ? { model: { ...request.promptOptions.model } } : {}),
          ...(request.promptOptions.agent ? { agent: request.promptOptions.agent } : {}),
          ...(request.promptOptions.variant ? { variant: request.promptOptions.variant } : {}),
        },
        promptErrorLogContext: { ...request.promptErrorLogContext },
      });
    }

    if (kept.length > 0) {
      record[sessionId] = kept;
    }
  }

  setPersistedQueuedPrompts(record);
}

/**
 * Restores queued prompts saved before a restart. Entries for sessions that
 * no longer exist are dropped; everything else is kept even when the server
 * is unreachable (dispatch is retried later instead of losing messages).
 */
export async function restoreQueuedPromptsFromSettings(): Promise<number> {
  const stored = getPersistedQueuedPrompts();
  const sessionIds = Object.keys(stored);
  if (sessionIds.length === 0) {
    return 0;
  }

  let serverUp = false;
  try {
    serverUp = (await probeOpencodeServer(opencodeServerVersion)).kind === "found";
  } catch (error) {
    logger.warn("[Bot] Startup queue restore: server probe failed, keeping entries", error);
  }

  let restored = 0;
  for (const sessionId of sessionIds) {
    const entries = stored[sessionId] ?? [];
    if (entries.length === 0) {
      continue;
    }

    if (serverUp) {
      try {
        const { data, error } = await opencodeClient.session.get({
          sessionID: sessionId,
          directory: entries[0]!.promptOptions.directory,
        });
        if (error || !data) {
          logger.info(`[Bot] Dropping queued prompts for gone session: ${sessionId}`);
          continue;
        }
      } catch (error) {
        logger.warn(`[Bot] Keeping queued prompts, session check failed: ${sessionId}`, error);
      }
    }

    const queue: QueuedPromptRequest[] = entries.map((entry) => ({
      queueId: entry.queueId,
      sessionId: entry.sessionId,
      chatId: entry.chatId,
      threadId: entry.threadId,
      responseMode: entry.responseMode as PromptResponseMode,
      promptOptions: {
        sessionID: entry.promptOptions.sessionID,
        directory: entry.promptOptions.directory,
        parts: entry.promptOptions.parts as QueuedPromptRequest["promptOptions"]["parts"],
        ...(entry.promptOptions.model ? { model: { ...entry.promptOptions.model } } : {}),
        ...(entry.promptOptions.agent ? { agent: entry.promptOptions.agent } : {}),
        ...(entry.promptOptions.variant ? { variant: entry.promptOptions.variant } : {}),
      },
      promptErrorLogContext: { ...entry.promptErrorLogContext },
      notifyOnQueue: true,
    }));

    queuedPromptRequests.set(sessionId, queue);
    for (const request of queue) {
      markForwardedPrompt(sessionId, getRequestText(request));
    }
    restored += queue.length;
  }

  persistQueuedPrompts();

  if (restored > 0) {
    logger.info(`[Bot] Restored ${restored} queued prompts after restart`);
  }
  return restored;
}

/** Tries to dispatch restored queues now that subscriptions are live. */
export async function dispatchRestoredQueues(): Promise<void> {
  for (const sessionId of [...queuedPromptRequests.keys()]) {
    try {
      await dispatchNextQueuedPrompt(sessionId);
    } catch (error) {
      logger.warn(`[Bot] Failed to dispatch restored queue: ${sessionId}`, error);
    }
  }
}

/** Removes all queued prompts for a session. Returns the removed count. */
export function clearQueuedPrompts(sessionId: string): number {
  const queue = queuedPromptRequests.get(sessionId);
  if (!queue || queue.length === 0) {
    return 0;
  }

  queuedPromptRequests.delete(sessionId);
  persistQueuedPrompts();
  return queue.length;
}

/** Snapshot of queued prompts for display (id + preview), oldest first. */
export function listQueuedPrompts(
  sessionId: string,
): Array<{ queueId: string; preview: string }> {
  return (queuedPromptRequests.get(sessionId) ?? []).map((request) => ({
    queueId: request.queueId,
    preview: getQueuedPromptPreview(request),
  }));
}

/** Moves a queued prompt to the front so it runs right after the current one. */
export function moveQueuedPromptToFront(queueId: string): QueuedPromptRequest | null {
  for (const [sessionId, queue] of queuedPromptRequests) {
    const index = queue.findIndex((request) => request.queueId === queueId);
    if (index !== -1) {
      const [removed] = queue.splice(index, 1);
      if (!removed) {
        return null;
      }
      queue.unshift(removed);
      queuedPromptRequests.set(sessionId, queue);
      persistQueuedPrompts();
      return removed;
    }
  }
  return null;
}

/** Removes a queued prompt by id. Returns the removed request or null. */
export function cancelQueuedPrompt(queueId: string): QueuedPromptRequest | null {
  for (const [sessionId, queue] of queuedPromptRequests) {
    const index = queue.findIndex((request) => request.queueId === queueId);
    if (index !== -1) {
      const [removed] = queue.splice(index, 1);
      if (queue.length === 0) {
        queuedPromptRequests.delete(sessionId);
      } else {
        queuedPromptRequests.set(sessionId, queue);
      }
      persistQueuedPrompts();
      return removed ?? null;
    }
  }
  return null;
}

export function getQueuedPromptCountForTests(sessionId: string): number {
  return getQueuedPromptCount(sessionId);
}

export function __enqueuePromptRequestForTests(request: QueuedPromptRequest): number {
  return enqueuePromptRequest(request);
}

function takeNextQueuedPromptRequest(sessionId: string): QueuedPromptRequest | null {
  const queue = queuedPromptRequests.get(sessionId);
  if (!queue || queue.length === 0) {
    return null;
  }

  const nextRequest = queue.shift() ?? null;
  if (queue.length === 0) {
    queuedPromptRequests.delete(sessionId);
  } else {
    queuedPromptRequests.set(sessionId, queue);
  }
  persistQueuedPrompts();

  return nextRequest;
}

function buildQueuedPromptCancelKeyboard(queueId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text(t("bot.session_queue_steer"), `${QUEUED_PROMPT_STEER_PREFIX}${queueId}`)
    .text(t("bot.session_queue_front"), `${QUEUED_PROMPT_FRONT_PREFIX}${queueId}`)
    .row()
    .text(t("bot.session_queued_cancel"), `${QUEUED_PROMPT_CANCEL_PREFIX}${queueId}`);
}

async function sendQueuedPromptNotice(
  bot: Bot<Context>,
  chatId: number,
  threadId: number | null,
  position: number,
  queueId: string,
): Promise<void> {
  await bot.api
    .sendMessage(chatId, t("bot.session_queued", { position: String(position) }), {
      ...getThreadSendOptions(threadId),
      reply_markup: buildQueuedPromptCancelKeyboard(queueId),
    })
    .catch(() => {});
}

function truncateQueuedPromptPreview(text: string): string {
  if (text.length <= QUEUED_PROMPT_PREVIEW_MAX_LENGTH) {
    return text;
  }

  return `${text.slice(0, QUEUED_PROMPT_PREVIEW_MAX_LENGTH - 3).trimEnd()}...`;
}

function getRequestText(request: QueuedPromptRequest): string {
  const textPart = request.promptOptions.parts.find(
    (part): part is TextPartInput => part.type === "text",
  );
  return textPart?.text.trim() ?? "";
}

function getQueuedPromptPreview(request: QueuedPromptRequest): string {
  const textParts = request.promptOptions.parts
    .filter((part): part is TextPartInput => part.type === "text")
    .map((part) => part.text.trim())
    .filter((text) => text.length > 0);

  const firstText = textParts[0] ?? "See attached file";
  return truncateQueuedPromptPreview(firstText);
}

async function sendQueuedPromptStartedNotice(
  bot: Bot<Context>,
  request: QueuedPromptRequest,
): Promise<void> {
  await bot.api
    .sendMessage(
      request.chatId,
      t("bot.session_queue_started", {
        preview: getQueuedPromptPreview(request),
      }),
      {
        ...getThreadSendOptions(request.threadId),
      },
    )
    .catch(() => {});
}

/** Handles the "move queued message to front" button. Returns true when consumed. */
export async function handleQueuedPromptFront(ctx: Context): Promise<boolean> {
  const data = ctx.callbackQuery?.data ?? "";
  if (!data.startsWith(QUEUED_PROMPT_FRONT_PREFIX)) {
    return false;
  }

  const queueId = data.slice(QUEUED_PROMPT_FRONT_PREFIX.length);
  if (!queueId) {
    return false;
  }

  const moved = moveQueuedPromptToFront(queueId);
  if (!moved) {
    await ctx.answerCallbackQuery({ text: t("bot.session_queue_cancel_missing") }).catch(() => {});
    return true;
  }

  logger.info(`[Bot] Moved queued prompt ${queueId} to front for session ${moved.sessionId}`);

  await ctx.answerCallbackQuery({ text: t("bot.session_queue_moved_front_callback") }).catch(() => {});
  await ctx
    .editMessageText(t("bot.session_queue_moved_front", { preview: getQueuedPromptPreview(moved) }))
    .catch(() => {});

  return true;
}

/** Handles the "interrupt and run queued message now" button. Returns true when consumed. */
export async function handleQueuedPromptSteer(ctx: Context): Promise<boolean> {
  const data = ctx.callbackQuery?.data ?? "";
  if (!data.startsWith(QUEUED_PROMPT_STEER_PREFIX)) {
    return false;
  }

  const queueId = data.slice(QUEUED_PROMPT_STEER_PREFIX.length);
  if (!queueId) {
    return false;
  }

  const removed = cancelQueuedPrompt(queueId);
  if (!removed) {
    await ctx.answerCallbackQuery({ text: t("bot.session_queue_cancel_missing") }).catch(() => {});
    return true;
  }

  if (!botInstance) {
    logger.error("[Bot] Cannot steer queued prompt: bot instance unavailable");
    enqueuePromptRequest(removed);
    await ctx.answerCallbackQuery({ text: t("bot.session_queue_steer_failed") }).catch(() => {});
    return true;
  }

  logger.info(`[Bot] Steering queued prompt ${queueId} for session ${removed.sessionId}`);
  markForwardedPrompt(removed.sessionId, getRequestText(removed));

  await ctx.answerCallbackQuery({ text: t("bot.session_queue_steering_callback") }).catch(() => {});
  await ctx
    .editMessageText(t("bot.session_queue_steering", { preview: getQueuedPromptPreview(removed) }))
    .catch(() => {});

  if (opencodeServerVersion !== "v2") {
    try {
      await opencodeClient.session.abort({
        sessionID: removed.promptOptions.sessionID,
        directory: removed.promptOptions.directory,
      });
    } catch (error) {
      logger.warn("[Bot] Abort before steer failed, submitting anyway:", error);
    }
    submitPromptRequest(botInstance, { ...removed, notifyOnQueue: true });
    return true;
  }

  submitPromptRequest(botInstance, { ...removed, notifyOnQueue: false }, { delivery: "steer" });
  return true;
}

/** Handles the "cancel queued message" button. Returns true when consumed. */
export async function handleQueuedPromptCancel(ctx: Context): Promise<boolean> {
  const data = ctx.callbackQuery?.data ?? "";
  if (!data.startsWith(QUEUED_PROMPT_CANCEL_PREFIX)) {
    return false;
  }

  const queueId = data.slice(QUEUED_PROMPT_CANCEL_PREFIX.length);
  if (!queueId) {
    return false;
  }

  const removed = cancelQueuedPrompt(queueId);
  if (!removed) {
    await ctx.answerCallbackQuery({ text: t("bot.session_queue_cancel_missing") }).catch(() => {});
    return true;
  }

  logger.info(`[Bot] Cancelled queued prompt ${queueId} for session ${removed.sessionId}`);
  unmarkForwardedPrompt(removed.sessionId, getRequestText(removed));

  await ctx.answerCallbackQuery({ text: t("bot.session_queue_cancelled_callback") }).catch(() => {});
  await ctx
    .editMessageText(t("bot.session_queue_cancelled", { preview: getQueuedPromptPreview(removed) }))
    .catch(() => {});

  return true;
}

function buildPromptRequest(
  currentSession: { id: string; directory: string },
  currentAgent: string | null,
  storedModel: StoredPromptModel,
  text: string,
  fileParts: FilePartInput[],
): { promptOptions: PromptRequestOptions; promptErrorLogContext: PromptErrorLogContext } {
  const parts: Array<TextPartInput | FilePartInput> = [];

  if (text.trim().length > 0) {
    parts.push({ type: "text", text });
  }

  parts.push(...fileParts);

  if (parts.length === 0 || (parts.length > 0 && parts.every((part) => part.type === "file"))) {
    if (fileParts.length > 0) {
      parts.unshift({ type: "text", text: "See attached file" });
    }
  }

  const promptOptions: PromptRequestOptions = {
    sessionID: currentSession.id,
    directory: currentSession.directory,
    parts,
    agent: currentAgent ?? undefined,
  };

  if (storedModel.providerID && storedModel.modelID) {
    promptOptions.model = {
      providerID: storedModel.providerID,
      modelID: storedModel.modelID,
    };

    if (storedModel.variant) {
      promptOptions.variant = storedModel.variant;
    }
  }

  return {
    promptOptions,
    promptErrorLogContext: {
      sessionId: currentSession.id,
      directory: currentSession.directory,
      agent: currentAgent || "default",
      modelProvider: storedModel.providerID || "default",
      modelId: storedModel.modelID || "default",
      variant: storedModel.variant || "default",
      promptLength: text.length,
      fileCount: fileParts.length,
    },
  };
}

function isConfiguredDefaultModel(model: StoredPromptModel): boolean {
  const provider = process.env.OPENCODE_MODEL_PROVIDER;
  const modelId = process.env.OPENCODE_MODEL_ID;
  if (!provider || !modelId) {
    return false;
  }

  return (
    model.providerID === provider &&
    model.modelID === modelId
  );
}

function toPromptModelInfo(model: LiveSessionModel | null | undefined): ModelInfo | null {
  const providerID = model?.providerID;
  const modelID = model?.id ?? model?.modelID;
  if (!providerID || !modelID) {
    return null;
  }

  return {
    providerID,
    modelID,
    variant: model.variant ?? "default",
  };
}

function samePromptModel(left: StoredPromptModel, right: StoredPromptModel): boolean {
  return (
    left.providerID === right.providerID &&
    left.modelID === right.modelID &&
    (left.variant ?? "default") === (right.variant ?? "default")
  );
}

async function resolveModelForExistingPrompt(
  currentSession: { id: string; directory: string },
  scopeKey: string,
  storedModel: StoredPromptModel,
): Promise<StoredPromptModel> {
  if (!isConfiguredDefaultModel(storedModel)) {
    return storedModel;
  }

  const { data: liveSession, error } = await opencodeClient.session.get({
    sessionID: currentSession.id,
    directory: currentSession.directory,
  });

  if (error || !liveSession) {
    logger.warn("[Bot] Failed to read live session model before prompt:", error);
    return storedModel;
  }

  const liveModel = toPromptModelInfo((liveSession as LiveSessionWithSelection).model);
  if (!liveModel || samePromptModel(storedModel, liveModel)) {
    return storedModel;
  }

  logger.info(
    `[Bot] Using live session model for existing prompt: ${liveModel.providerID}/${liveModel.modelID}`,
  );
  setCurrentModel(liveModel, scopeKey);
  return liveModel;
}

function setActivePromptResponseMode(sessionId: string, responseMode: PromptResponseMode): void {
  activePromptResponseModes.set(sessionId, responseMode);
}

export function getDefaultPromptResponseMode(): PromptResponseMode {
  return isTtsEnabled() ? "text_and_tts" : "text_only";
}

export function activatePromptResponseMode(
  sessionId: string,
  responseMode: PromptResponseMode,
): void {
  setActivePromptResponseMode(sessionId, responseMode);
}

export function clearPromptResponseMode(sessionId: string): void {
  activePromptResponseModes.delete(sessionId);
}

export function consumePromptResponseMode(sessionId: string): PromptResponseMode | null {
  const responseMode = activePromptResponseModes.get(sessionId) ?? null;
  activePromptResponseModes.delete(sessionId);
  return responseMode;
}

/** Reads the response mode without clearing it, so it lasts the whole turn. */
export function getPromptResponseMode(sessionId: string): PromptResponseMode | null {
  return activePromptResponseModes.get(sessionId) ?? null;
}

function submitPromptRequest(
  bot: Bot<Context>,
  request: QueuedPromptRequest,
  options: { delivery?: "steer" } = {},
): void {
  setActivePromptResponseMode(request.sessionId, request.responseMode);
  assistantRunState.startRun(request.sessionId, {
    startedAt: Date.now(),
    configuredAgent: request.promptOptions.agent,
    configuredProviderID: request.promptOptions.model?.providerID,
    configuredModelID: request.promptOptions.model?.modelID,
  });

  const steer = options.delivery === "steer" && opencodeServerVersion === "v2";
  logger.info(
    `[Bot] Calling session.promptAsync (fire-and-forget) with agent=${request.promptOptions.agent}, fileCount=${request.promptErrorLogContext.fileCount}, delivery=${steer ? "steer" : "queue"}...`,
  );

  // `delivery` only exists on the V2 API; the cast keeps the shared call
  // compiling for both versions while the V2 wrapper forwards it at runtime.
  const promptParams = (
    steer ? { ...request.promptOptions, delivery: "steer" as const } : request.promptOptions
  ) as typeof request.promptOptions;

  safeBackgroundTask({
    taskName: "session.promptAsync",
    task: () => opencodeClient.session.promptAsync(promptParams),
    onSuccess: ({ error }) => {
      if (error) {
        const details = formatErrorDetails(error, 6000);
        const errorType = classifyPromptSubmitError(error);
        logger.error(
          "[Bot] OpenCode API returned an error for session.promptAsync",
          request.promptErrorLogContext,
        );
        logger.error("[Bot] session.promptAsync error details:", details);
        logger.error("[Bot] session.promptAsync raw API error object:", error);

        if (errorType === "busy") {
          clearPromptResponseMode(request.sessionId);
          assistantRunState.clearRun(request.sessionId, "prompt_busy_requeued");
          const queued = withQueuedPromptId({
            ...request,
            notifyOnQueue: false,
          });
          const position = enqueuePromptRequest(queued);
          if (request.notifyOnQueue) {
            void sendQueuedPromptNotice(bot, request.chatId, request.threadId, position, queued.queueId);
          }
          return;
        }

        const errorMessageKey =
          errorType === "session_not_found"
            ? "bot.prompt_send_error_session_not_found"
            : "bot.prompt_send_error";

        assistantRunState.clearRun(request.sessionId, "prompt_submit_error");

        void bot.api
          .sendMessage(request.chatId, t(errorMessageKey), {
            ...getThreadSendOptions(request.threadId),
          })
          .catch(() => {});
        return;
      }

      logger.info("[Bot] session.promptAsync accepted");
    },
    onError: (error) => {
      const details = formatErrorDetails(error, 6000);
      const errorType = classifyPromptSubmitError(error);
      logger.error(
        "[Bot] session.promptAsync background task failed",
        request.promptErrorLogContext,
      );
      logger.error("[Bot] session.promptAsync background failure details:", details);
      logger.error("[Bot] session.promptAsync raw background error object:", error);

      if (errorType === "busy") {
        clearPromptResponseMode(request.sessionId);
        assistantRunState.clearRun(request.sessionId, "prompt_busy_background_requeued");
        const queued = withQueuedPromptId({
          ...request,
          notifyOnQueue: false,
        });
        const position = enqueuePromptRequest(queued);
        if (request.notifyOnQueue) {
          void sendQueuedPromptNotice(bot, request.chatId, request.threadId, position, queued.queueId);
        }
        return;
      }

      const errorMessageKey =
        errorType === "session_not_found"
          ? "bot.prompt_send_error_session_not_found"
          : "bot.prompt_send_error";

      clearPromptResponseMode(request.sessionId);
      assistantRunState.clearRun(request.sessionId, "prompt_submit_background_error");

      void bot.api
        .sendMessage(request.chatId, t(errorMessageKey), {
          ...getThreadSendOptions(request.threadId),
        })
        .catch(() => {});
    },
  });
}

export async function dispatchNextQueuedPrompt(sessionId: string): Promise<boolean> {
  if (
    !botInstance ||
    drainingQueuedSessions.has(sessionId) ||
    getQueuedPromptCount(sessionId) === 0
  ) {
    return false;
  }

  const nextRequest = takeNextQueuedPromptRequest(sessionId);
  if (!nextRequest) {
    return false;
  }

  drainingQueuedSessions.add(sessionId);
  try {
    const sessionBusy = await isSessionBusy(sessionId, nextRequest.promptOptions.directory);
    if (sessionBusy) {
      enqueuePromptRequest(nextRequest);
      return false;
    }

    await sendQueuedPromptStartedNotice(botInstance, nextRequest);
    markForwardedPrompt(sessionId, getRequestText(nextRequest));
    submitPromptRequest(botInstance, {
      ...nextRequest,
      notifyOnQueue: false,
    });
    return true;
  } finally {
    drainingQueuedSessions.delete(sessionId);
  }
}

export function __resetQueuedPromptsForTests(): void {
  queuedPromptRequests.clear();
  drainingQueuedSessions.clear();
  activePromptResponseModes.clear();
  queuedPromptSequence = 0;
  persistQueuedPrompts();
}

async function isSessionBusy(sessionId: string, directory: string): Promise<boolean> {
  try {
    const { data, error } = await opencodeClient.session.status({ directory });

    if (error || !data) {
      logger.warn("[Bot] Failed to check session status before prompt:", error);
      return false;
    }

    const sessionStatus = (data as Record<string, { type?: string }>)[sessionId];
    if (!sessionStatus) {
      return false;
    }

    logger.debug(`[Bot] Current session status before prompt: ${sessionStatus.type || "unknown"}`);
    return sessionStatus.type === "busy";
  } catch (err) {
    logger.warn("[Bot] Error checking session status before prompt:", err);
    return false;
  }
}

function resetMismatchedSessionContextForScope(scopeKey: string): void {
  clearAllInteractionState(INTERACTION_CLEAR_REASON.SESSION_MISMATCH_RESET, scopeKey);
  clearSession(scopeKey);
}

export interface ProcessPromptDeps {
  bot: Bot<Context>;
  ensureEventSubscription: (directory: string) => Promise<void>;
  prepareSessionForPrompt?: (sessionId: string) => Promise<void>;
}

/**
 * Processes a user prompt: ensures project/session, subscribes to events, and sends
 * the prompt to OpenCode. Used by text, voice, and photo message handlers.
 *
 * @param ctx - Grammy context
 * @param text - Text content of the prompt
 * @param deps - Dependencies (bot and event subscription)
 * @param fileParts - Optional file parts (for photo/document attachments)
 * @returns true if the prompt was dispatched, false if it was blocked/failed early.
 */
export async function processUserPrompt(
  ctx: Context,
  text: string,
  deps: ProcessPromptDeps,
  fileParts: FilePartInput[] = [],
  options: ProcessPromptOptions = {},
): Promise<boolean> {
  const { bot, ensureEventSubscription, prepareSessionForPrompt } = deps;
  const scope = getScopeFromContext(ctx);
  const responseMode = options.responseMode ?? getDefaultPromptResponseMode();
  const scopeKey = scope?.key ?? GLOBAL_SCOPE_KEY;
  const usePinned = ctx.chat?.type !== CHAT_TYPE.PRIVATE;

  if (scope && isEphemeralTopicScope(scope.key)) {
    await ctx.api
      .sendMessage(ctx.chat!.id, t("subagent.topic_readonly"), {
        ...getThreadSendOptions(scope.threadId),
      })
      .catch(() => {});
    return false;
  }

  if (
    scope?.context === SCOPE_CONTEXT.GROUP_TOPIC &&
    ctx.chat &&
    typeof scope.threadId === "number" &&
    (await getScheduledTaskTopicByChatAndThread(ctx.chat.id, scope.threadId))
  ) {
    await ctx.reply(t("task.output_topic_blocked"), getThreadSendOptions(scope.threadId));
    return false;
  }

  const currentProject = getCurrentProject(scopeKey);
  if (!currentProject) {
    await ctx.reply(t("bot.project_not_selected"));
    return false;
  }

  if (
    scope?.context === SCOPE_CONTEXT.GROUP_TOPIC &&
    currentProject.id.includes(":") &&
    !(await projectDirectoryExists(currentProject.worktree))
  ) {
    await ctx.reply(t("topic.worktree_missing"), getThreadSendOptions(scope.threadId));
    return false;
  }

  botInstance = bot;
  chatIdInstance = ctx.chat!.id;

  // Initialize pinned message manager if not already
  if (usePinned && !pinnedMessageManager.isInitialized(scopeKey)) {
    pinnedMessageManager.initialize(bot.api, ctx.chat!.id, scopeKey, scope?.threadId ?? null);
  }

  // Initialize keyboard manager if not already
  keyboardManager.initialize(bot.api, ctx.chat!.id, scopeKey);

  let currentSession = getCurrentSession(scopeKey);

  if (scope?.context === SCOPE_CONTEXT.GROUP_TOPIC && !getTopicBindingByScopeKey(scopeKey)) {
    await ctx.reply(t(BOT_I18N_KEY.TOPIC_UNBOUND), getThreadSendOptions(scope.threadId));
    return false;
  }

  if (currentSession && currentSession.directory !== currentProject.worktree) {
    logger.warn(
      `[Bot] Session/project mismatch detected. sessionDirectory=${currentSession.directory}, projectDirectory=${currentProject.worktree}. Resetting session context.`,
    );
    resetMismatchedSessionContextForScope(scopeKey);
    await ctx.reply(t("bot.session_reset_project_mismatch"));
    return false;
  }

  if (!currentSession) {
    if (scope?.context === SCOPE_CONTEXT.GROUP_TOPIC) {
      await ctx.reply(t(BOT_I18N_KEY.TOPIC_UNBOUND), getThreadSendOptions(scope.threadId));
      return false;
    }

    await ctx.reply(t("bot.creating_session"));

    const { data: session, error } = await opencodeClient.session.create({
      directory: currentProject.worktree,
    });

    if (error || !session) {
      await ctx.reply(t("bot.create_session_error"));
      return false;
    }

    logger.info(
      `[Bot] Created new session: id=${session.id}, title="${session.title}", project=${currentProject.worktree}`,
    );

    currentSession = {
      id: session.id,
      title: session.title,
      directory: currentProject.worktree,
    };

    setCurrentSession(currentSession, scopeKey);
    await ingestSessionInfoForCache(session);

    // Create pinned message for new session
    if (usePinned) {
      try {
        await pinnedMessageManager.onSessionChange(session.id, session.title, scopeKey);
      } catch (err) {
        logger.error("[Bot] Error creating pinned message for new session:", err);
      }
    }

    if (usePinned && pinnedMessageManager.getContextLimit(scopeKey) === 0) {
      await pinnedMessageManager.refreshContextLimit(scopeKey);
    }

    const currentAgent = await resolveProjectAgent(getStoredAgent(scopeKey), scopeKey);
    const currentModel = getStoredModel(scopeKey);
    const contextInfo =
      (usePinned ? pinnedMessageManager.getContextInfo(scopeKey) : null) ??
      keyboardManager.getContextInfo(scopeKey) ??
      (usePinned && pinnedMessageManager.getContextLimit(scopeKey) > 0
        ? { tokensUsed: 0, tokensLimit: pinnedMessageManager.getContextLimit(scopeKey) }
        : null);
    const variantName = formatVariantForButton(currentModel.variant || "default");
    const keyboard = createMainKeyboard(
      currentAgent,
      currentModel,
      contextInfo ?? undefined,
      variantName,
    );

    await ctx.reply(t("bot.session_created", { title: session.title }), {
      reply_markup: keyboard,
    });
  } else {
    logger.info(
      `[Bot] Using existing session: id=${currentSession.id}, title="${currentSession.title}"`,
    );

    // Ensure pinned message exists for existing session
    if (usePinned && !pinnedMessageManager.getState(scopeKey).messageId) {
      try {
        await pinnedMessageManager.onSessionChange(
          currentSession.id,
          currentSession.title,
          scopeKey,
        );
      } catch (err) {
        logger.error("[Bot] Error creating pinned message for existing session:", err);
      }
    }
  }

  await ensureEventSubscription(currentSession.directory);

  summaryAggregator.setSession(currentSession.id);

  const sessionIsBusy = await isSessionBusy(currentSession.id, currentSession.directory);
  if (sessionIsBusy) {
    // Same text as the tail of the queue (double-tap, impatient resend):
    // acknowledge the existing entry instead of running the turn twice.
    const pending = queuedPromptRequests.get(currentSession.id) ?? [];
    const tailText = pending.length > 0 ? getRequestText(pending[pending.length - 1]) : null;
    if (tailText !== null && tailText === text.trim()) {
      const tailEntry = pending[pending.length - 1];
      logger.info(
        `[Bot] Dropping duplicate queued prompt for busy session ${currentSession.id} (already at position ${pending.length})`,
      );
      await ctx.reply(t("bot.session_queued_duplicate", { position: String(pending.length) }), {
        reply_markup: tailEntry
          ? buildQueuedPromptCancelKeyboard(tailEntry.queueId)
          : undefined,
      });
      return true;
    }

    const currentAgent = await resolveProjectAgent(getStoredAgent(scopeKey), scopeKey);
    const storedModel = await resolveModelForExistingPrompt(
      currentSession,
      scopeKey,
      getStoredModel(scopeKey),
    );
    const queuedRequest = buildPromptRequest(
      currentSession,
      currentAgent,
      storedModel,
      text,
      fileParts,
    );
    const position = enqueuePromptRequest(
      withQueuedPromptId({
        sessionId: currentSession.id,
        chatId: ctx.chat!.id,
        threadId: scope?.threadId ?? null,
        responseMode,
        promptOptions: queuedRequest.promptOptions,
        promptErrorLogContext: queuedRequest.promptErrorLogContext,
        notifyOnQueue: true,
      }),
    );
    markForwardedPrompt(currentSession.id, text);

    logger.info(
      `[Bot] Queued prompt for busy session ${currentSession.id} at position ${position}`,
    );
    const queuedList = queuedPromptRequests.get(currentSession.id) ?? [];
    const queuedEntry = queuedList[queuedList.length - 1];
    await ctx.reply(t("bot.session_queued", { position: String(position) }), {
      reply_markup: queuedEntry
        ? buildQueuedPromptCancelKeyboard(queuedEntry.queueId)
        : undefined,
    });
    return true;
  }

  try {
    const currentAgent = await resolveProjectAgent(getStoredAgent(scopeKey), scopeKey);
    const storedModel = await resolveModelForExistingPrompt(
      currentSession,
      scopeKey,
      getStoredModel(scopeKey),
    );
    if (prepareSessionForPrompt) {
      await prepareSessionForPrompt(currentSession.id);
    }

    const request = buildPromptRequest(currentSession, currentAgent, storedModel, text, fileParts);
    markForwardedPrompt(currentSession.id, text);
    submitPromptRequest(bot, withQueuedPromptId({
      sessionId: currentSession.id,
      chatId: ctx.chat!.id,
      threadId: scope?.threadId ?? null,
      responseMode,
      promptOptions: request.promptOptions,
      promptErrorLogContext: request.promptErrorLogContext,
      notifyOnQueue: true,
    }));

    return true;
  } catch (err) {
    logger.error("Error in prompt handler:", err);
    if (interactionManager.getSnapshot(scopeKey)) {
      clearAllInteractionState(INTERACTION_CLEAR_REASON.MESSAGE_HANDLER_ERROR, scopeKey);
    }
    await ctx.reply(t("error.generic"));
    return false;
  }
}
