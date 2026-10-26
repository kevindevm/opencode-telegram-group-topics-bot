import { Context, InlineKeyboard } from "grammy";
import { permissionManager } from "../../permission/manager.js";
import { getTrustLevel, isAutoAllowed } from "../../permission/trust.js";
import { opencodeClient } from "../../opencode/client.js";
import { getCurrentProject } from "../../settings/manager.js";
import { getCurrentSession, getSessionById } from "../../session/manager.js";
import { summaryAggregator } from "../../summary/aggregator.js";
import { interactionManager } from "../../interaction/manager.js";
import { INTERACTION_CLEAR_REASON } from "../../interaction/constants.js";
import { logger } from "../../utils/logger.js";
import { PermissionRequest, PermissionReply } from "../../permission/types.js";
import type { I18nKey } from "../../i18n/en.js";
import { t } from "../../i18n/index.js";
import { sendBotText, truncateTelegramText } from "../utils/telegram-text.js";
import { getScopeFromContext, getScopeKeyFromContext, getThreadSendOptions } from "../scope.js";

const PERMISSION_CALLBACK = {
  PREFIX: "permission:",
  SEPARATOR: ":",
  ACTION_INDEX: 1,
  REQUEST_ID_INDEX: 2,
} as const;

const TELEGRAM_PERMISSION_SEND_RETRY_LIMIT = 3;

/**
 * Grace period before a permission poll is shown. Requests resolved quickly
 * (e.g. auto-accepted on PC) never pop a poll, so spammy agents don't block
 * the topic and the interaction only starts for genuinely pending requests.
 */
const PERMISSION_SHOW_GRACE_MS = 2500;

const pendingShowTimers = new Map<string, { timer: ReturnType<typeof setTimeout>; scopeKey: string }>();

/**
 * Schedules the poll for a permission request after the grace period.
 * Duplicate deliveries of the same request share a single timer.
 */
export function schedulePermissionPoll(
  bot: Context["api"],
  chatId: number,
  request: PermissionRequest,
  scopeKey: string,
  threadId: number | null,
): void {
  if (permissionManager.wasSettledRecently(request.id)) {
    logger.debug(
      `[PermissionHandler] Skipping schedule for already-settled request: requestID=${request.id}`,
    );
    return;
  }

  if (pendingShowTimers.has(request.id)) {
    return;
  }

  const trustLevel = getTrustLevel(request.sessionID);
  if (isAutoAllowed(trustLevel, request.permission)) {
    logger.info(
      `[PermissionHandler] Auto-approving permission by trust level ${trustLevel}: type=${request.permission}, requestID=${request.id}`,
    );
    void autoApprovePermissionRequest(request, scopeKey);
    return;
  }

  logger.debug(
    `[PermissionHandler] Scheduling permission poll in ${PERMISSION_SHOW_GRACE_MS}ms: requestID=${request.id}`,
  );
  const timer = setTimeout(() => {
    pendingShowTimers.delete(request.id);
    void showPermissionRequest(bot, chatId, request, scopeKey, threadId).catch((error) => {
      logger.error("[PermissionHandler] Failed to show scheduled permission poll:", error);
    });
  }, PERMISSION_SHOW_GRACE_MS);
  pendingShowTimers.set(request.id, { timer, scopeKey });
}

export function cancelScheduledPermissionPoll(requestID: string): void {
  const pending = pendingShowTimers.get(requestID);
  if (!pending) {
    return;
  }

  clearTimeout(pending.timer);
  pendingShowTimers.delete(requestID);
}

export function cancelAllScheduledPermissionPolls(scopeKey?: string): void {
  for (const [requestID, pending] of pendingShowTimers) {
    if (scopeKey !== undefined && pending.scopeKey !== scopeKey) {
      continue;
    }

    clearTimeout(pending.timer);
    pendingShowTimers.delete(requestID);
  }
}

export function __resetScheduledPermissionPollsForTests(): void {
  for (const pending of pendingShowTimers.values()) {
    clearTimeout(pending.timer);
  }

  pendingShowTimers.clear();
}

/**
 * Replies "once" to a permission request covered by the session trust level,
 * without showing a poll. Silent by design: trust mode exists to remove taps.
 */
async function autoApprovePermissionRequest(
  request: PermissionRequest,
  scopeKey: string,
): Promise<void> {
  const currentProject = getCurrentProject(scopeKey);
  const currentSession = getCurrentSession(scopeKey);
  const cachedSession = getSessionById(request.sessionID);
  const directory =
    (currentSession?.id === request.sessionID ? currentSession.directory : null) ??
    cachedSession?.directory ??
    currentProject?.worktree;

  if (!directory) {
    logger.warn(
      `[PermissionHandler] Cannot auto-approve permission, no directory: requestID=${request.id}`,
    );
    return;
  }

  const { error } = await opencodeClient.permission.reply({
    requestID: request.id,
    directory,
    reply: "once",
  });

  if (error) {
    logger.warn("[PermissionHandler] Trust auto-approve failed, poll will show instead:", error);
    return;
  }

  logger.info(`[PermissionHandler] Trust auto-approved permission: requestID=${request.id}`);
  permissionManager.markSettled(request.id);
  cancelScheduledPermissionPoll(request.id);
}

type PermissionCallbackAction = PermissionReply;

function getRetryAfterMs(error: unknown): number | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const params = Reflect.get(error, "parameters");
  if (!params || typeof params !== "object") {
    return null;
  }

  const retryAfter = Reflect.get(params, "retry_after");
  if (typeof retryAfter !== "number" || retryAfter <= 0) {
    return null;
  }

  return retryAfter * 1000;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ParsedPermissionCallback {
  action: PermissionCallbackAction;
  requestIDFromPayload: string | null;
}

interface ResolvedPermissionRequest {
  messageId: number | null;
  request: PermissionRequest;
}

// Permission type display names
const PERMISSION_NAME_KEYS: Record<string, I18nKey> = {
  bash: "permission.name.bash",
  edit: "permission.name.edit",
  write: "permission.name.write",
  read: "permission.name.read",
  webfetch: "permission.name.webfetch",
  websearch: "permission.name.websearch",
  glob: "permission.name.glob",
  grep: "permission.name.grep",
  list: "permission.name.list",
  task: "permission.name.task",
  lsp: "permission.name.lsp",
  external_directory: "permission.name.external_directory",
};

// Permission reply outcome lines shown once a prompt settles
const PERMISSION_OUTCOME_KEYS: Record<PermissionReply, I18nKey> = {
  once: "permission.outcome.once",
  always: "permission.outcome.always",
  reject: "permission.outcome.reject",
};

export function buildPermissionOutcomeText(
  request: PermissionRequest,
  outcome: PermissionReply | "settled_outside",
): string {
  const outcomeLine =
    outcome === "settled_outside"
      ? t("permission.outcome.settled_outside")
      : t(PERMISSION_OUTCOME_KEYS[outcome]);
  return `${formatPermissionText(request).trimEnd()}\n${outcomeLine}`;
}

// Permission type emojis
const PERMISSION_EMOJIS: Record<string, string> = {
  bash: "⚡",
  edit: "✏️",
  write: "📝",
  read: "📖",
  webfetch: "🌐",
  websearch: "🔍",
  glob: "📁",
  grep: "🔎",
  list: "📂",
  task: "⚙️",
  lsp: "🔧",
  external_directory: "📁",
};

function getCallbackMessageId(ctx: Context): number | null {
  const message = ctx.callbackQuery?.message;
  if (!message || !("message_id" in message)) {
    return null;
  }

  const messageId = (message as { message_id?: number }).message_id;
  return typeof messageId === "number" ? messageId : null;
}

function clearPermissionInteraction(reason: string, scopeKey: string): void {
  const state = interactionManager.getSnapshot(scopeKey);
  if (state?.kind === "permission") {
    interactionManager.clear(reason, scopeKey);
  }
}

export function syncPermissionInteractionState(
  scopeKey: string,
  metadata: Record<string, unknown> = {},
): void {
  const pendingCount = permissionManager.getPendingCount(scopeKey);

  if (pendingCount === 0) {
    clearPermissionInteraction(INTERACTION_CLEAR_REASON.PERMISSION_NO_PENDING_REQUESTS, scopeKey);
    return;
  }

  const nextMetadata: Record<string, unknown> = {
    pendingCount,
    ...metadata,
  };

  const state = interactionManager.getSnapshot(scopeKey);
  if (state?.kind === "permission") {
    interactionManager.transition(
      {
        expectedInput: "callback",
        metadata: nextMetadata,
      },
      scopeKey,
    );
    return;
  }

  interactionManager.start(
    {
      kind: "permission",
      expectedInput: "callback",
      metadata: nextMetadata,
    },
    scopeKey,
  );
}

function isPermissionReply(value: string): value is PermissionReply {
  return value === "once" || value === "always" || value === "reject";
}

function isPermissionRequestNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    _tag?: unknown;
    name?: unknown;
    message?: unknown;
    data?: { message?: unknown };
  };

  if (candidate._tag === "PermissionNotFoundError") {
    return true;
  }

  if (candidate.name === "NotFoundError") {
    return true;
  }

  return [candidate.message, candidate.data?.message].some(
    (message) =>
      typeof message === "string" &&
      message.toLowerCase().includes("permission request not found"),
  );
}

function parsePermissionCallback(data: string): ParsedPermissionCallback | null {
  if (!data.startsWith(PERMISSION_CALLBACK.PREFIX)) {
    return null;
  }

  const parts = data.split(PERMISSION_CALLBACK.SEPARATOR);
  const action = parts[PERMISSION_CALLBACK.ACTION_INDEX] ?? "";
  if (!isPermissionReply(action)) {
    return null;
  }

  const payloadRequestID = parts[PERMISSION_CALLBACK.REQUEST_ID_INDEX] ?? "";
  const requestIDFromPayload = payloadRequestID.length > 0 ? payloadRequestID : null;

  return {
    action,
    requestIDFromPayload,
  };
}

function resolvePermissionRequest(
  messageId: number | null,
  requestIDFromPayload: string | null,
  scopeKey: string,
): ResolvedPermissionRequest | null {
  const requestByMessageId = permissionManager.getRequest(messageId, scopeKey);
  if (requestByMessageId) {
    return {
      messageId,
      request: requestByMessageId,
    };
  }

  if (!requestIDFromPayload) {
    return null;
  }

  const matchByID = permissionManager.getRequestByID(requestIDFromPayload, scopeKey);
  if (!matchByID) {
    return null;
  }

  return {
    messageId: matchByID.messageId,
    request: matchByID.request,
  };
}

/**
 * Handle permission callback from inline buttons
 */
export async function handlePermissionCallback(ctx: Context): Promise<boolean> {
  const data = ctx.callbackQuery?.data;
  if (!data) return false;

  const parsedCallback = parsePermissionCallback(data);
  if (!parsedCallback) {
    return false;
  }

  logger.debug(`[PermissionHandler] Received callback: ${data}`);
  const scopeKey = getScopeKeyFromContext(ctx);

  if (!permissionManager.isActive(scopeKey)) {
    clearPermissionInteraction(INTERACTION_CLEAR_REASON.PERMISSION_INACTIVE_CALLBACK, scopeKey);
    await ctx.answerCallbackQuery({ text: t("permission.inactive_callback"), show_alert: true });
    return true;
  }

  const callbackMessageId = getCallbackMessageId(ctx);
  const resolvedRequest = resolvePermissionRequest(
    callbackMessageId,
    parsedCallback.requestIDFromPayload,
    scopeKey,
  );
  if (!resolvedRequest) {
    await ctx.answerCallbackQuery({ text: t("permission.inactive_callback"), show_alert: true });
    return true;
  }

  try {
    await handlePermissionReply(ctx, parsedCallback.action, resolvedRequest, scopeKey);
  } catch (err) {
    logger.error("[PermissionHandler] Error handling callback:", err);
    await ctx.answerCallbackQuery({
      text: t("permission.processing_error_callback"),
      show_alert: true,
    });
  }

  return true;
}

/**
 * Handle permission reply (once/always/reject)
 */
async function handlePermissionReply(
  ctx: Context,
  reply: PermissionReply,
  resolvedRequest: ResolvedPermissionRequest,
  scopeKey: string,
): Promise<void> {
  const { request, messageId: callbackMessageId } = resolvedRequest;
  const requestID = request.id;
  const currentProject = getCurrentProject(scopeKey);
  const currentSession = getCurrentSession(scopeKey);
  const cachedSession = getSessionById(request.sessionID);
  const chatId = ctx.chat?.id;
  const threadId = getScopeFromContext(ctx)?.threadId ?? null;
  const directory =
    (currentSession?.id === request.sessionID ? currentSession.directory : null) ??
    cachedSession?.directory ??
    currentProject?.worktree;

  if (!directory || !chatId) {
    permissionManager.clear(scopeKey);
    clearPermissionInteraction(
      INTERACTION_CLEAR_REASON.PERMISSION_INVALID_RUNTIME_CONTEXT,
      scopeKey,
    );

    await ctx.answerCallbackQuery({
      text: t("permission.no_active_request_callback"),
      show_alert: true,
    });
    return;
  }

  // Reply labels for user feedback
  const replyLabels: Record<PermissionReply, string> = {
    once: t("permission.reply.once"),
    always: t("permission.reply.always"),
    reject: t("permission.reply.reject"),
  };

  await ctx.answerCallbackQuery({ text: replyLabels[reply] });

  // Stop typing indicator since we're responding
  summaryAggregator.stopTypingIndicator(request.sessionID);

  logger.info(`[PermissionHandler] Sending permission reply: ${reply}, requestID=${requestID}`);

  const { error } = await opencodeClient.permission.reply({
    requestID,
    directory,
    reply,
  });

  if (error) {
    logger.error("[PermissionHandler] Failed to send permission reply:", error);

    if (isPermissionRequestNotFound(error)) {
      logger.info(
        `[PermissionHandler] Permission already resolved server-side, dropping poll: requestID=${requestID}`,
      );
      permissionManager.markSettled(requestID);
      cancelScheduledPermissionPoll(requestID);
      await ctx
        .editMessageText(buildPermissionOutcomeText(request, "settled_outside"))
        .catch(() => {});
      permissionManager.removeByMessageId(callbackMessageId, scopeKey);
      syncPermissionInteractionState(scopeKey, {});
      await ctx.answerCallbackQuery().catch(() => {});
      return;
    }

    if (ctx.api) {
      await ctx.api
        .sendMessage(chatId, t("permission.send_reply_error"), getThreadSendOptions(threadId))
        .catch(() => {});
    }
    return;
  }

  logger.info("[PermissionHandler] Permission reply sent successfully");

  permissionManager.markSettled(requestID);
  cancelScheduledPermissionPoll(requestID);
  await ctx.editMessageText(buildPermissionOutcomeText(request, reply)).catch(() => {});

  permissionManager.removeByMessageId(callbackMessageId, scopeKey);

  if (!permissionManager.isActive(scopeKey)) {
    clearPermissionInteraction(INTERACTION_CLEAR_REASON.PERMISSION_REPLIED, scopeKey);
    return;
  }

  syncPermissionInteractionState(scopeKey, {
    lastRepliedRequestID: requestID,
  });
}

/**
 * Show permission request message with inline buttons
 */
export async function showPermissionRequest(
  bot: Context["api"],
  chatId: number,
  request: PermissionRequest,
  scopeKey: string,
  threadId: number | null,
): Promise<void> {
  logger.debug(`[PermissionHandler] Showing permission request: ${request.permission}`);

  if (permissionManager.consumeSettled(request.id)) {
    logger.info(
      `[PermissionHandler] Skipping poll for already-settled request: requestID=${request.id}, scope=${scopeKey}`,
    );
    return;
  }

  if (permissionManager.hasRequestID(request.id, scopeKey)) {
    logger.info(
      `[PermissionHandler] Skipping duplicate permission request by id: requestID=${request.id}, scope=${scopeKey}`,
    );
    syncPermissionInteractionState(scopeKey, {
      requestID: request.id,
    });
    summaryAggregator.stopTypingIndicator(request.sessionID);
    return;
  }

  const equivalentRequest = permissionManager.findEquivalentRequest(request, scopeKey);
  if (equivalentRequest) {
    logger.info(
      `[PermissionHandler] Skipping equivalent active permission request: requestID=${request.id}, existingRequestID=${equivalentRequest.request.id}, scope=${scopeKey}`,
    );
    syncPermissionInteractionState(scopeKey, {
      requestID: equivalentRequest.request.id,
      messageId: equivalentRequest.messageId,
    });
    summaryAggregator.stopTypingIndicator(request.sessionID);
    return;
  }

  const text = formatPermissionText(request);
  const keyboard = buildPermissionKeyboard(request.id);

  try {
    let message: Awaited<ReturnType<typeof sendBotText>> | null = null;

    for (let attempt = 1; attempt <= TELEGRAM_PERMISSION_SEND_RETRY_LIMIT; attempt++) {
      try {
        message = await sendBotText({
          api: bot,
          chatId,
          text,
          options: {
            reply_markup: keyboard,
            ...getThreadSendOptions(threadId),
          },
        });
        break;
      } catch (err) {
        const retryAfterMs = getRetryAfterMs(err);
        const shouldRetry = retryAfterMs !== null && attempt < TELEGRAM_PERMISSION_SEND_RETRY_LIMIT;

        if (!shouldRetry) {
          throw err;
        }

        logger.warn(
          `[PermissionHandler] Retrying permission message after Telegram 429: requestID=${request.id}, attempt=${attempt}, retryAfterMs=${retryAfterMs}`,
        );
        await delay(retryAfterMs + 100);
      }
    }

    if (!message) {
      throw new Error("Permission message send failed without Telegram response");
    }

    logger.debug(`[PermissionHandler] Message sent, messageId=${message.message_id}`);
    permissionManager.startPermission(request, message.message_id, scopeKey);

    syncPermissionInteractionState(scopeKey, {
      requestID: request.id,
      messageId: message.message_id,
    });

    summaryAggregator.stopTypingIndicator(request.sessionID);
  } catch (err) {
    logger.error("[PermissionHandler] Failed to send permission message:", err);
    throw err;
  }
}

/**
 * Format permission request text
 */
function formatPermissionText(request: PermissionRequest): string {
  const emoji = PERMISSION_EMOJIS[request.permission] || "🔐";
  const nameKey = PERMISSION_NAME_KEYS[request.permission];
  const name = nameKey ? t(nameKey) : request.permission;

  let text = t("permission.header", { emoji, name });

  // Show patterns (commands/files)
  if (request.patterns.length > 0) {
    request.patterns.forEach((pattern) => {
      text += `• ${pattern}\n`;
    });
  }

  return truncateTelegramText(text);
}

/**
 * Build inline keyboard with permission buttons
 */
function buildPermissionKeyboard(requestID: string): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  keyboard
    .text(
      t("permission.button.allow"),
      `${PERMISSION_CALLBACK.PREFIX}once${PERMISSION_CALLBACK.SEPARATOR}${requestID}`,
    )
    .row();
  keyboard
    .text(
      t("permission.button.always"),
      `${PERMISSION_CALLBACK.PREFIX}always${PERMISSION_CALLBACK.SEPARATOR}${requestID}`,
    )
    .row();
  keyboard.text(
    t("permission.button.reject"),
    `${PERMISSION_CALLBACK.PREFIX}reject${PERMISSION_CALLBACK.SEPARATOR}${requestID}`,
  );

  return keyboard;
}
