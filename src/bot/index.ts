import { Bot, Context, InputFile, NextFunction } from "grammy";
import { SocksProxyAgent } from "socks-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";
import { config } from "../config.js";
import { authMiddleware } from "./middleware/auth.js";
import { interactionGuardMiddleware } from "./middleware/interaction-guard.js";
import { scheduledOutputTopicMiddleware } from "./middleware/scheduled-output-topic.js";
import { unknownCommandMiddleware } from "./middleware/unknown-command.js";
import { BOT_COMMANDS, getLocalizedDmBotCommands } from "./commands/definitions.js";
import { startCommand } from "./commands/start.js";
import { helpCommand } from "./commands/help.js";
import { lastCommand } from "./commands/last.js";
import { statusCommand } from "./commands/status.js";
import {
  AGENT_MODE_BUTTON_TEXT_PATTERN,
  MODEL_BUTTON_TEXT_PATTERN,
  VARIANT_BUTTON_TEXT_PATTERN,
} from "./message-patterns.js";
import { sessionsCommand, handleSessionSelect } from "./commands/sessions.js";
import { recentCommand, handleRecentSelect } from "./commands/recent.js";
import { createNewCommand } from "./commands/new.js";
import { projectsCommand, handleProjectSelect } from "./commands/projects.js";
import { openCommand, handleOpenCallback } from "./commands/open.js";
import { taskCommand, handleTaskTextAnswer } from "./commands/task.js";
import { handleTaskListCallback, taskListCommand } from "./commands/tasklist.js";
import { abortCommand } from "./commands/abort.js";
import { opencodeStartCommand } from "./commands/opencode-start.js";
import { opencodeStopCommand } from "./commands/opencode-stop.js";
import { reloadCommand } from "./commands/reload.js";
import { renameCommand, handleRenameCancel, handleRenameTextAnswer } from "./commands/rename.js";
import {
  commandsCommand,
  handleCommandsCallback,
  handleCommandTextArguments,
} from "./commands/commands.js";
import {
  handleSkillTextArguments,
  handleSkillsCallback,
  skillsCommand,
} from "./commands/skills.js";
import { ttsCommand } from "./commands/tts.js";
import {
  handleQuestionCallback,
  showCurrentQuestion,
  handleQuestionTextAnswer,
  closeQuestionSettledOutside,
  isDuplicateQuestionDelivery,
} from "./handlers/question.js";
import { handleRefreshCommand } from "./commands/refresh.js";
import { handlePermissionCallback, syncPermissionInteractionState, buildPermissionOutcomeText, cancelScheduledPermissionPoll, schedulePermissionPoll } from "./handlers/permission.js";
import { permissionManager } from "../permission/manager.js";
import { handleAgentSelect, showAgentSelectionMenu } from "./handlers/agent.js";
import { handleModelSelect, handleModelSearchTextAnswer, showModelSelectionMenu } from "./handlers/model.js";
import { handleVariantSelect, showVariantSelectionMenu } from "./handlers/variant.js";
import { handleContextButtonPress, handleCompactConfirm } from "./handlers/context.js";
import { handleInlineMenuCancel } from "./handlers/inline-menu.js";
import { handleQueuedPromptCancel, handleQueuedPromptFront, handleQueuedPromptSteer } from "./handlers/prompt.js";
import { displayCommand, handleDisplayCallback } from "./commands/display.js";
import { queueCommand, handleQueueCallback } from "./commands/queue.js";
import { trustCommand, handleTrustCallback } from "./commands/trust.js";
import {
  clearAllBackgroundOffers,
  clearSessionBackgroundOffers,
  handleToolBackgroundCallback,
  noteToolBackgroundState,
} from "../tool/background-offer.js";
import { createRetryCommand } from "./commands/retry.js";
import { diffCommand, commitCommand } from "./commands/diff.js";
import { costCommand } from "./commands/cost.js";
import { closeCommand } from "./commands/close.js";
import { createForkCommand } from "./commands/fork.js";
import { shareCommand } from "./commands/share.js";
import { createSavedCommand } from "./commands/saved.js";
import { addDailyCost } from "../settings/manager.js";
import { formatUsd, recordSessionCost, shouldAlertBudget, todayKey } from "../session/cost-tracker.js";
import { DISPLAY_FLAG, isDisplayVisible } from "../display/manager.js";
import { questionManager } from "../question/manager.js";
import { interactionManager } from "../interaction/manager.js";
import { clearAllInteractionState } from "../interaction/cleanup.js";
import { keyboardManager } from "../keyboard/manager.js";
import { stopEventListening, subscribeToEvents } from "../opencode/events.js";
import { summaryAggregator } from "../summary/aggregator.js";
import {
  formatSummaryWithRawFallback,
  formatToolInfo,
  getAssistantParseMode,
} from "../summary/formatter.js";
import { renderSubagentCards } from "../summary/subagent-formatter.js";
import {
  ensureSubagentTopic,
  finalizeSubagentTopic,
  isEphemeralTopicScope,
} from "./handlers/subagent-topics.js";
import {
  getCachedSessionProjects,
  ingestSessionInfoForCache,
} from "../session/cache-manager.js";
import { getCurrentSession } from "../settings/manager.js";
import { logger } from "../utils/logger.js";
import { BackgroundSessionTracker } from "../app/managers/background-session-manager.js";
import { createBackgroundNoticeDelivery } from "../bot/events/background-notice-delivery.js";
import { TelegramEventDelivery } from "../bot/events/telegram-event-delivery.js";
import { safeBackgroundTask } from "../utils/safe-background-task.js";
import { pinnedMessageManager } from "../pinned/manager.js";
import { taskCreationManager } from "../scheduled-task/creation-manager.js";
import { t } from "../i18n/index.js";
import {
  clearPromptResponseMode,
  dispatchNextQueuedPrompt,
  processUserPrompt,
} from "./handlers/prompt.js";
import { handleVoiceMessage } from "./handlers/voice.js";
import { handleDocumentMessage } from "./handlers/document.js";
import { downloadTelegramFile, toDataUri } from "./utils/file-download.js";
import { editBotRenderedPart, editBotText } from "./utils/telegram-text.js";
import { sendBotRenderedPart, sendBotText } from "./utils/telegram-text.js";
import { isTelegramMessageNotModifiedError } from "./utils/send-with-markdown-fallback.js";
import { extractCommandName } from "./utils/commands.js";
import {
  isOperationAbortedSessionError,
  isInvalidRequestSessionError,
  SessionErrorThrottle,
} from "./utils/session-error-filter.js";
import { getModelCapabilities, supportsInput } from "../model/capabilities.js";
import { getStoredModel } from "../model/manager.js";
import { getCurrentProject } from "../settings/manager.js";
import {
  GLOBAL_SCOPE_KEY,
  SCOPE_CONTEXT,
  createScopeKeyFromParams,
  getChatActionThreadOptions,
  getScopeFromContext,
  getThreadSendOptions,
} from "./scope.js";
import {
  RateLimitExceededError,
  TelegramRateLimiter,
  runWithRateLimitRetries,
} from "./telegram-rate-limiter.js";
import type { Event as OpenCodeEvent, FilePartInput } from "@opencode-ai/sdk/v2";
import { getSessionRouteTarget, listAllTopicBindings } from "../topic/manager.js";
import { BOT_COMMAND, DM_ALLOWED_COMMANDS } from "./commands/constants.js";
import { INTERACTION_CLEAR_REASON } from "../interaction/constants.js";
import { BOT_I18N_KEY, CHAT_TYPE, GENERAL_TOPIC, TELEGRAM_CHAT_FIELD } from "./constants.js";
import { TELEGRAM_CHAT_ACTION } from "./telegram-constants.js";
import { syncTopicTitleForSession } from "../topic/title-sync.js";
import { sendTtsResponseForSession } from "./utils/send-tts-response.js";
import { consumePendingCompactionNotice } from "./utils/pending-compaction-notices.js";
import { LiveStream } from "./streaming/live-stream.js";
import { contextStateManager } from "../context/manager.js";
import { formatContextForButton } from "./utils/keyboard.js";
import { SessionOutputCoordinator } from "./session-output-coordinator.js";
import { assistantRunState } from "./assistant-run-state.js";
import { formatAssistantRunFooter } from "./utils/assistant-run-footer.js";
import { renderAssistantFinalPartsSafe } from "./utils/assistant-rendering.js";
import { buildCodeBlockMessages } from "./utils/code-block.js";
import { buildSessionRetryMessage } from "./utils/retry-message.js";
import { registerPcUserMessage, takePcUserText } from "./pc-user-mirror.js";
import {
  claimPcTextMirror,
  isForwardedPrompt,
} from "../session/forwarded-prompts.js";
import { loadLastUserMessage, truncateText } from "../session/history.js";
import { getTopicBindingBySessionId } from "../topic/manager.js";
import { TOPIC_SESSION_STATUS } from "../settings/manager.js";
import { ensureTopicSessionTracked, extractTrackableSessionId } from "./event-session-tracking.js";

let botInstance: Bot<Context> | null = null;
const chatIdInstance: number | null = null;
const initializedCommandChats = new Set<number>();
const renamedGeneralTopicChats = new Set<number>();
const DM_ALLOWED_COMMAND_SET = new Set<string>(DM_ALLOWED_COMMANDS);
const telegramRateLimiter = new TelegramRateLimiter();
const eventCallbackByDirectory = new Map<string, (event: OpenCodeEvent) => void>();
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Single global SSE consumer. The server fans every event out to every
 * connection, so one callback (registered once) replaces the old
 * per-directory clones that processed every event N times.
 */
let sharedEventCallback: ((event: OpenCodeEvent) => void) | null = null;
let sharedBackgroundTracker: BackgroundSessionTracker | null = null;

/**
 * Single background tracker for the shared stream. The tracker's directory
 * is write-only bookkeeping; events are global, so one instance replaces the
 * old per-subscription clones that notified N times.
 */
function getSharedBackgroundTracker(): BackgroundSessionTracker | null {
  if (!config.bot.trackBackgroundSessions) {
    return null;
  }

  if (!sharedBackgroundTracker) {
    const tracker = new BackgroundSessionTracker();
    tracker.setOnNotification(
      createBackgroundNoticeDelivery(
        {
          getDestination: () => {
            if (!botInstance || !chatIdInstance) {
              return null;
            }
            return { api: botInstance.api, chatId: chatIdInstance };
          },
        },
        new TelegramEventDelivery(),
      ),
    );
    sharedBackgroundTracker = tracker;
  }

  return sharedBackgroundTracker;
}

function getSharedEventCallback(): (event: OpenCodeEvent) => void {
  if (!sharedEventCallback) {
    sharedEventCallback = (event: OpenCodeEvent): void => {
      if (event.type === "session.created" || event.type === "session.updated") {
        const info = (
          event.properties as { info?: { directory?: string; time?: { updated?: number } } }
        ).info;

        if (info?.directory) {
          safeBackgroundTask({
            taskName: `session.cache.${event.type}`,
            task: () => ingestSessionInfoForCache(info),
          });
        }
      }

      mirrorPcUserMessageEvent(event);
      mirrorPcPromptOnRunStart(event);
      ensureTopicSessionTracked(event);
      ensureTopicManagersForLiveEvent(event);

      const sessionTitleUpdate = extractSessionTitleUpdate(event);
      if (sessionTitleUpdate && botInstance) {
        const activeBot = botInstance;
        safeBackgroundTask({
          taskName: "topic.title.sync_from_event",
          task: () =>
            syncTopicTitleForSession(
              activeBot.api,
              sessionTitleUpdate.sessionId,
              sessionTitleUpdate.title,
            ),
          onError: (syncError) => {
            logger.debug("[Bot] Failed to sync topic title from session.updated", {
              sessionId: sessionTitleUpdate.sessionId,
              syncError,
            });
          },
        });
      }

      // Process event through the shared background session tracker for
      // PC->Telegram mirroring.
      const currentSessionId = getCurrentSession()?.id ?? null;
      getSharedBackgroundTracker()?.processEvent(
        event as unknown as { type: string; properties?: unknown },
        currentSessionId,
      );

      summaryAggregator.processEvent(event);
    };
  }

  return sharedEventCallback;
}

async function ensureGeneralTopicName(ctx: Context): Promise<void> {
  if (!ctx.chat || ctx.chat.type === CHAT_TYPE.PRIVATE) {
    return;
  }

  if (renamedGeneralTopicChats.has(ctx.chat.id)) {
    return;
  }

  const isForumEnabled = Reflect.get(ctx.chat, TELEGRAM_CHAT_FIELD.IS_FORUM) === true;
  if (!isForumEnabled) {
    return;
  }

  try {
    await ctx.api.editGeneralForumTopic(ctx.chat.id, GENERAL_TOPIC.NAME);
    renamedGeneralTopicChats.add(ctx.chat.id);
    logger.info(`[Bot] Renamed General topic in chat ${ctx.chat.id} to "${GENERAL_TOPIC.NAME}"`);
  } catch (error) {
    logger.debug("[Bot] Failed to rename General topic", {
      chatId: ctx.chat.id,
      error,
    });
  }
}

function rememberScopeTarget(ctx: Context): void {
  const scope = getScopeFromContext(ctx);
  if (!scope) {
    return;
  }

  telegramRateLimiter.setActiveScopeKey(scope.key);
}

function isReplyKeyboardControlText(text: string): boolean {
  return (
    AGENT_MODE_BUTTON_TEXT_PATTERN.test(text) ||
    MODEL_BUTTON_TEXT_PATTERN.test(text) ||
    VARIANT_BUTTON_TEXT_PATTERN.test(text) ||
    /^📊(?:\s|$)/.test(text) ||
    text === t("keyboard.general_defaults")
  );
}

function bindBotInstance(bot: Bot<Context>): void {
  botInstance = bot;
}

function getTargetBySessionId(
  sessionId: string,
): { chatId: number; threadId: number | null; scopeKey: string } | null {
  const target = getSessionRouteTarget(sessionId);
  if (!target) {
    return null;
  }

  return {
    chatId: target.chatId,
    threadId: target.threadId,
    scopeKey: target.scopeKey,
  };
}

/**
 * Transcript-only subagent topics reject new prompts (poll answers are
 * handled by their own flows before this runs). Returns true when consumed.
 */
async function replyEphemeralTopicReadonly(ctx: Context): Promise<boolean> {
  const scope = getScopeFromContext(ctx);
  const chatId = ctx.chat?.id;
  if (!scope || chatId === undefined || !isEphemeralTopicScope(scope.key)) {
    return false;
  }

  await ctx.api
    .sendMessage(chatId, t("subagent.topic_readonly"), {
      ...getThreadSendOptions(scope.threadId),
    })
    .catch(() => {});
  return true;
}

function asMirrorString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Mirrors user prompts typed on other clients (PC) into the session topic.
 * The `message.updated` (role user) announcement registers the message and
 * the following text `message.part.updated` carries the content. Prompts the
 * bot forwarded itself are already visible and get skipped.
 */
function mirrorPcUserMessageEvent(event: OpenCodeEvent): void {
  if (event.type !== "message.updated" && event.type !== "message.part.updated") {
    return;
  }

  const props = event.properties as unknown as {
    info?: { id?: unknown; sessionID?: unknown; sessionId?: unknown; role?: unknown };
    part?: {
      sessionID?: unknown;
      sessionId?: unknown;
      messageID?: unknown;
      messageId?: unknown;
      type?: unknown;
      text?: unknown;
    };
  };

  if (event.type === "message.updated") {
    const info = props.info;
    if (!info || info.role !== "user") {
      return;
    }

    const sessionId = asMirrorString(info.sessionID) ?? asMirrorString(info.sessionId);
    const messageId = asMirrorString(info.id);
    if (!sessionId || !messageId) {
      return;
    }

    registerPcUserMessage(sessionId, messageId);
    return;
  }

  const part = props.part;
  if (!part || part.type !== "text") {
    return;
  }

  const sessionId = asMirrorString(part.sessionID) ?? asMirrorString(part.sessionId);
  const messageId = asMirrorString(part.messageID) ?? asMirrorString(part.messageId);
  const text = asMirrorString(part.text);
  if (!sessionId || !messageId || !text || !botInstance) {
    return;
  }

  const payload = takePcUserText(sessionId, messageId, text);
  if (!payload) {
    return;
  }

  // Skip when the run-start poll already mirrored the same text.
  if (!claimPcTextMirror(payload.sessionId, payload.text)) {
    return;
  }

  const mirrorScopeKey =
    typeof payload.target.threadId === "number"
      ? createScopeKeyFromParams({
          chatId: payload.target.chatId,
          threadId: payload.target.threadId,
          context: SCOPE_CONTEXT.GROUP_TOPIC,
        })
      : undefined;
  if (!isDisplayVisible(DISPLAY_FLAG.PC_MIRROR, mirrorScopeKey)) {
    return;
  }

  const activeBot = botInstance;
  safeBackgroundTask({
    taskName: "pc_user_mirror.send",
    task: () =>
      activeBot.api.sendMessage(
        payload.target.chatId,
        t("pcuser.echo", { text: truncateText(payload.text, 3900) }),
        getThreadSendOptions(payload.target.threadId),
      ),
    onError: (error) => {
      logger.error("[Bot] Failed to mirror PC user message to topic:", error);
    },
  });
}

/**
 * Fallback mirror for PC prompts that never cross the inbox (V2 emits no
 * user-message events for direct runs). When a run starts, the latest user
 * message must be fresh, bot-forwarded texts are skipped by peek, and the
 * claim dedups against the inbox-delivery path.
 */
function mirrorPcPromptOnRunStart(event: OpenCodeEvent): void {
  if (event.type !== "session.status") {
    return;
  }

  const properties = event.properties as {
    sessionID?: unknown;
    status?: { type?: unknown };
  };
  const sessionId = properties.sessionID;
  if (typeof sessionId !== "string" || !sessionId || properties.status?.type !== "busy") {
    return;
  }

  if (!botInstance) {
    return;
  }

  const activeBot = botInstance;
  safeBackgroundTask({
    taskName: "pc_user_mirror.run_start",
    task: async () => {
      // Let the just-sent message land in history before reading it back.
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const binding = getTopicBindingBySessionId(sessionId);
      if (
        !binding ||
        (binding.status !== TOPIC_SESSION_STATUS.ACTIVE &&
          binding.status !== TOPIC_SESSION_STATUS.ABANDONED) ||
        !binding.projectWorktree
      ) {
        return;
      }

      let lastUser: Awaited<ReturnType<typeof loadLastUserMessage>>;
      try {
        lastUser = await loadLastUserMessage(sessionId, binding.projectWorktree);
      } catch (error) {
        logger.debug("[Bot] Run-start mirror: could not load last user message", {
          sessionId,
          error,
        });
        return;
      }

      const text = lastUser?.text?.trim() ?? "";
      if (!text) {
        return;
      }

      // Only fresh prompts: an older latest message means the new text is not
      // in history yet (or this busy event belongs to an older turn).
      if (Date.now() - (lastUser?.created ?? 0) > 120_000) {
        return;
      }

      if (isForwardedPrompt(sessionId, text)) {
        return;
      }

      if (!claimPcTextMirror(sessionId, text)) {
        return;
      }

      const scopeKey = createScopeKeyFromParams({
        chatId: binding.chatId,
        threadId: binding.threadId,
        context: SCOPE_CONTEXT.GROUP_TOPIC,
      });
      if (!isDisplayVisible(DISPLAY_FLAG.PC_MIRROR, scopeKey)) {
        return;
      }

      logger.info(`[Bot] Mirroring PC prompt on run start for session ${sessionId}`);
      await activeBot.api
        .sendMessage(binding.chatId, t("pcuser.echo", { text: truncateText(text, 3900) }), {
          ...getThreadSendOptions(binding.threadId),
        })
        .catch((error: unknown) => {
          logger.error("[Bot] Failed to mirror PC prompt on run start:", error);
        });
    },
  });
}

/**
 * Self-heals the per-topic UI state on live events: after a restart (or when
 * a session only ever runs from the PC) the pinned dashboard and keyboard
 * are uninitialized, so cost/context would freeze even though messages flow.
 * Attaching on the first live event of a bound session restores both.
 */
function ensureTopicManagersForLiveEvent(event: OpenCodeEvent): void {
  if (!botInstance) {
    return;
  }

  const sessionId = extractTrackableSessionId(event);
  if (!sessionId) {
    return;
  }

  const binding = getTopicBindingBySessionId(sessionId);
  if (
    !binding ||
    binding.ephemeral ||
    (binding.status !== TOPIC_SESSION_STATUS.ACTIVE &&
      binding.status !== TOPIC_SESSION_STATUS.ABANDONED)
  ) {
    return;
  }

  const activeBot = botInstance;
  if (!pinnedMessageManager.isInitialized(binding.scopeKey)) {
    pinnedMessageManager.initialize(activeBot.api, binding.chatId, binding.scopeKey, binding.threadId);
  }
  keyboardManager.initialize(activeBot.api, binding.chatId, binding.scopeKey);

  if (pinnedMessageManager.getState(binding.scopeKey).sessionId !== sessionId) {
    void pinnedMessageManager
      .attachSession(sessionId, binding.scopeKey)
      .catch((error: unknown) => {
        logger.debug("[Bot] Failed to attach live session to pinned dashboard:", {
          sessionId,
          error,
        });
      });
  }
}

function extractSessionTitleUpdate(
  event: OpenCodeEvent,
): { sessionId: string; title: string } | null {
  if (event.type !== "session.updated") {
    return null;
  }

  const eventProperties = event.properties as {
    info?: { id?: unknown; title?: unknown };
    session?: { id?: unknown; title?: unknown };
    sessionID?: unknown;
    title?: unknown;
  };

  const infoSessionId =
    typeof eventProperties.info?.id === "string" ? eventProperties.info.id : null;
  const infoTitle =
    typeof eventProperties.info?.title === "string" ? eventProperties.info.title : null;
  if (infoSessionId && infoTitle) {
    return { sessionId: infoSessionId, title: infoTitle };
  }

  const sessionId =
    typeof eventProperties.session?.id === "string"
      ? eventProperties.session.id
      : typeof eventProperties.sessionID === "string"
        ? eventProperties.sessionID
        : null;

  const title =
    typeof eventProperties.session?.title === "string"
      ? eventProperties.session.title
      : typeof eventProperties.title === "string"
        ? eventProperties.title
        : null;

  if (!sessionId || !title) {
    return null;
  }

  return { sessionId, title };
}

const TELEGRAM_DOCUMENT_CAPTION_MAX_LENGTH = 1024;
const SUBAGENT_STREAM_PREFIX = "🧩";
const TODO_STREAM_PREFIX = "__todo__";
const TOOL_STREAM_PREFIX = "__tool__";
const SESSION_ERROR_MESSAGE_MAX_LENGTH = 3500;
const FINAL_DELIVERY_SETTLE_MS = Math.max(1500, config.bot.responseStreamThrottleMs + 500);
const FILE_MUTATION_TOOLS = new Set(["write", "edit", "apply_patch"]);
/** Past this many code blocks, long files go out as a single .txt document. */
const MAX_CODE_BLOCK_MESSAGES = 5;
const sessionErrorThrottle = new SessionErrorThrottle(3000);

function getToolStreamKey(callId: string): string {
  return `${TOOL_STREAM_PREFIX}:${callId}`;
}

async function finalizeSessionDelivery(
  sessionId: string,
  pendingCompletionText: string | null,
): Promise<boolean> {
  let deliveryComplete = false;

  try {
    await liveStream.flushSession(sessionId);
    if (pendingCompletionText) {
      deliveryComplete = await deliverAssistantCompletion(sessionId, pendingCompletionText)
        .then(() => true)
        .catch((error) => {
          logger.error("[Bot] Failed to deliver pending assistant completion", {
            sessionId,
            error,
          });
          return false;
        });
    } else {
      deliveryComplete = true;
    }

    if (!deliveryComplete) {
      return false;
    }

    await liveStream.cleanupAfterFinalDelivery(sessionId);

    const target = getTargetBySessionId(sessionId);
    if (target && pinnedMessageManager.isInitialized(target.scopeKey)) {
      syncKeyboardContextFromPinnedState(target.scopeKey);
      await pinnedMessageManager.flush(target.scopeKey);
    }

    if (target) {
      seedLiveKeyboardRepostBaseline(target.scopeKey);
      // The in-place finalize path edits text only (reply keyboards cannot be
      // attached by edit), so push one silent refresh to guarantee the topic
      // ends the turn with a current keyboard. Fingerprint dedup makes this
      // a no-op when nothing changed.
      if (botInstance && keyboardManager.isInitialized(target.scopeKey)) {
        await keyboardManager
          .sendKeyboardUpdate(target.chatId, target.scopeKey)
          .catch((error: unknown) => {
            logger.debug("[Bot] Failed to repost final keyboard", { sessionId, error });
          });
      }
    }
  } finally {
    if (deliveryComplete) {
      // Coordinator decides when this finalize attempt is the committed final delivery.
    }
  }

  return deliveryComplete;
}

const sessionOutputCoordinator = new SessionOutputCoordinator({
  settleMs: FINAL_DELIVERY_SETTLE_MS,
  onFinalizeSession: finalizeSessionDelivery,
  onFinalDeliveryCommitted: async (sessionId) => {
    summaryAggregator.stopTypingIndicator(sessionId);
    await liveStream.sealCurrentMessage(sessionId, true);
    await dispatchNextQueuedPrompt(sessionId);
  },
  handlers: {
    onAssistantUpdate: async ({ sessionId, messageId, text }) => {
      await liveStream.updateAssistant(sessionId, messageId, text);
    },
    onAssistantComplete: async ({ sessionId, messageId, text }) => {
      await liveStream.completeAssistant(sessionId, messageId, text);
    },
    onTool: async ({ sessionId, toolInfo }) => {
      if (!botInstance) {
        logger.error("Bot or chat ID not available for sending tool notification");
        return;
      }

      const toolScopeKey = getTargetBySessionId(sessionId)?.scopeKey;
      const isFileMutationTool = FILE_MUTATION_TOOLS.has(toolInfo.tool);
      if (
        !isDisplayVisible(DISPLAY_FLAG.TOOL_CALLS, toolScopeKey) ||
        isFileMutationTool ||
        toolInfo.tool === "task"
      ) {
        return;
      }

      try {
        const target = getTargetBySessionId(sessionId);
        const projectWorktree = target ? getCurrentProject(target.scopeKey)?.worktree : undefined;
        const message = formatToolInfo(toolInfo, projectWorktree);
        if (!message) {
          return;
        }

        const status = "status" in toolInfo.state ? toolInfo.state.status : undefined;
        const streamKey =
          toolInfo.tool === "todowrite" ? TODO_STREAM_PREFIX : getToolStreamKey(toolInfo.callId);

        await liveStream.breakServiceBoundary(sessionId);

        if (status === "running") {
          liveStream.replaceServiceByPrefix(sessionId, streamKey, `⏳ ${message}`);
          return;
        }

        if (status === "error") {
          liveStream.replaceServiceByPrefix(sessionId, streamKey, `❌ ${message}`);
          return;
        }

        liveStream.replaceServiceByPrefix(sessionId, streamKey, `✅ ${message}`);
      } catch (err) {
        logger.error("Failed to send tool notification to Telegram:", err);
      }
    },
    onSubagent: async ({ sessionId, subagents }) => {
      if (botInstance) {
        const activeBot = botInstance;
        for (const subagent of subagents) {
          if (!subagent.sessionId) {
            continue;
          }
          const ensured = await ensureSubagentTopic(activeBot.api, sessionId, subagent);
          if (
            ensured &&
            (subagent.status === "completed" || subagent.status === "error")
          ) {
            await finalizeSubagentTopic(
              activeBot.api,
              subagent.sessionId,
              subagent.status,
              subagent.description,
            );
          }
        }
      }

      if (!isDisplayVisible(DISPLAY_FLAG.TOOL_CALLS, getTargetBySessionId(sessionId)?.scopeKey)) {
        return;
      }

      try {
        await liveStream.breakServiceBoundary(sessionId);
        const renderedCards = renderSubagentCards(subagents);
        liveStream.replaceServiceByPrefix(sessionId, SUBAGENT_STREAM_PREFIX, renderedCards);
      } catch (err) {
        logger.error("Failed to render subagent activity for Telegram:", err);
      }
    },
    onToolFile: async ({ sessionId, fileInfo }) => {
      if (!botInstance) {
        logger.error("Bot or chat ID not available for sending file");
        return;
      }

      const fileScopeKey = getTargetBySessionId(sessionId)?.scopeKey;
      if (!isDisplayVisible(DISPLAY_FLAG.TOOL_FILES, fileScopeKey)) {
        return;
      }

      try {
        const target = getTargetBySessionId(sessionId);
        const projectWorktree = target ? getCurrentProject(target.scopeKey)?.worktree : undefined;
        const toolMessage = formatToolInfo(fileInfo, projectWorktree);

        await liveStream.sealCurrentMessage(sessionId, false, true);
        for (const entry of fileInfo.files) {
          if (!entry.fileData) {
            continue;
          }
          const caption = prepareDocumentCaption(
            entry.line || toolMessage || entry.fileData.caption,
          );
          if (isDisplayVisible(DISPLAY_FLAG.CODE_BLOCKS, fileScopeKey)) {
            const sentAsCodeBlock = await sendSessionCodeBlockMessage(sessionId, {
              ...entry.fileData,
              caption,
            });
            if (sentAsCodeBlock) {
              continue;
            }
          }
          await sendSessionDocumentMessage(sessionId, {
            ...entry.fileData,
            caption,
          });
        }
      } catch (err) {
        logger.error("Failed to send file to Telegram:", err);
      }
    },
    onQuestion: async ({ sessionId, questions, requestId }) => {
      if (!botInstance) {
        logger.error("Bot or chat ID not available for showing questions");
        return;
      }

      const target = getTargetBySessionId(sessionId);
      if (!target) {
        return;
      }

      if (isDuplicateQuestionDelivery(target.scopeKey, requestId)) {
        logger.debug(`[Bot] Ignoring duplicate question delivery: requestID=${requestId}`);
        return;
      }

      await liveStream.sealCurrentMessage(sessionId, true);

      if (questionManager.isActive(target.scopeKey)) {
        logger.warn("[Bot] Replacing active poll with a new one");

        const previousMessageIds = questionManager.getMessageIds(target.scopeKey);
        for (const messageId of previousMessageIds) {
          await botInstance.api.deleteMessage(target.chatId, messageId).catch(() => {});
        }

        clearAllInteractionState(
          INTERACTION_CLEAR_REASON.QUESTION_REPLACED_BY_NEW_POLL,
          target.scopeKey,
        );
      }

      logger.info(
        `[Bot] Received ${questions.length} questions from agent, requestID=${requestId}`,
      );
      questionManager.startQuestions(questions, requestId, target.scopeKey);
      await showCurrentQuestion(botInstance.api, target.chatId, target.scopeKey, target.threadId);
    },
    onPermission: async ({ sessionId, request }) => {
      if (!botInstance) {
        logger.error("Bot or chat ID not available for showing permission request");
        return;
      }

      const target = getTargetBySessionId(sessionId);
      if (!target) {
        return;
      }

      await liveStream.sealCurrentMessage(sessionId);

      logger.info(
        `[Bot] Received permission request from agent: type=${request.permission}, requestID=${request.id}`,
      );
      schedulePermissionPoll(
        botInstance.api,
        target.chatId,
        request,
        target.scopeKey,
        target.threadId,
      );
    },
    onThinking: async ({ sessionId }) => {
      if (!isDisplayVisible(DISPLAY_FLAG.THINKING, getTargetBySessionId(sessionId)?.scopeKey) || !botInstance) {
        return;
      }

      const target = getTargetBySessionId(sessionId);
      if (!target) {
        return;
      }

      logger.debug("[Bot] Agent started thinking");
      liveStream.showThinking(sessionId, t("bot.thinking"));
    },
    onSessionError: async ({ sessionId, message }) => {
      if (!botInstance) {
        clearPromptResponseMode(sessionId);
        assistantRunState.clearRun(sessionId, "session_error_no_bot");
        return;
      }

      const target = getTargetBySessionId(sessionId);
      if (!target) {
        clearPromptResponseMode(sessionId);
        assistantRunState.clearRun(sessionId, "session_error_no_target");
        return;
      }

      clearPromptResponseMode(sessionId);
      assistantRunState.clearRun(sessionId, "session_error");
      await liveStream.flushSession(sessionId);
      await liveStream.sealCurrentMessage(sessionId, true);

      const normalizedMessage = message.trim() || t("common.unknown_error");
      if (isOperationAbortedSessionError(normalizedMessage)) {
        logger.info(`[Bot] Suppressing session.abort error notification for ${sessionId}`);
        return;
      }

      if (sessionErrorThrottle.shouldSuppress(sessionId, normalizedMessage)) {
        logger.debug(`[Bot] Suppressing duplicate session.error notification for ${sessionId}`);
        return;
      }

      const truncatedMessage =
        normalizedMessage.length > SESSION_ERROR_MESSAGE_MAX_LENGTH
          ? `${normalizedMessage.slice(0, SESSION_ERROR_MESSAGE_MAX_LENGTH - 3)}...`
          : normalizedMessage;

      const templateKey = isInvalidRequestSessionError(normalizedMessage)
        ? "bot.session_error_invalid_request"
        : "bot.session_error";

      await botInstance.api
        .sendMessage(target.chatId, t(templateKey, { message: truncatedMessage }), {
          ...getThreadSendOptions(target.threadId),
        })
        .catch((err) => {
          logger.error("[Bot] Failed to send session.error message:", err);
        });
    },
    onSessionRetry: async ({ sessionId, retryInfo }) => {
      if (!botInstance) {
        return;
      }

      liveStream.replaceServiceByPrefix(
        sessionId,
        "🔁",
        buildSessionRetryMessage({
          message: retryInfo.message,
          next: retryInfo.next,
          maxLength: SESSION_ERROR_MESSAGE_MAX_LENGTH,
        }),
      );
    },
  },
});

function isGroupGeneralControlScope(ctx: Context): boolean {
  const scope = getScopeFromContext(ctx);
  const isForumEnabled =
    ctx.chat?.type === CHAT_TYPE.SUPERGROUP &&
    Reflect.get(ctx.chat, TELEGRAM_CHAT_FIELD.IS_FORUM) === true;

  return Boolean(isForumEnabled && scope?.context === SCOPE_CONTEXT.GROUP_GENERAL && ctx.chat);
}

async function replyGeneralControlPromptRestriction(ctx: Context): Promise<void> {
  await ctx.reply(
    t(BOT_I18N_KEY.GROUP_GENERAL_PROMPTS_DISABLED),
    getThreadSendOptions(getScopeFromContext(ctx)?.threadId ?? null),
  );
}

function prepareDocumentCaption(caption: string): string {
  const normalizedCaption = caption.trim();
  if (!normalizedCaption) {
    return "";
  }

  if (normalizedCaption.length <= TELEGRAM_DOCUMENT_CAPTION_MAX_LENGTH) {
    return normalizedCaption;
  }

  return `${normalizedCaption.slice(0, TELEGRAM_DOCUMENT_CAPTION_MAX_LENGTH - 3)}...`;
}

async function deliverAssistantCompletion(sessionId: string, messageText: string): Promise<void> {
  const normalizedMessageText = messageText.trim();
  if (!normalizedMessageText) {
    return;
  }

  const currentRun = assistantRunState.getRun(sessionId);
  const finalMessageText = currentRun
    ? `${normalizedMessageText}\n\n${formatAssistantRunFooter(currentRun)}`
    : normalizedMessageText;

  if (!botInstance) {
    clearPromptResponseMode(sessionId);
    logger.error("Bot not available for sending message");
    return;
  }

  const target = getTargetBySessionId(sessionId);
  if (!target) {
    clearPromptResponseMode(sessionId);
    return;
  }

  syncKeyboardContextFromPinnedState(target.scopeKey);

  try {
    const activeBot = botInstance;
    if (!activeBot) {
      clearPromptResponseMode(sessionId);
      return;
    }

    const assistantParseMode = getAssistantParseMode();
    const format = assistantParseMode === "MarkdownV2" ? "markdown_v2" : "raw";
    const finalParts = renderAssistantFinalPartsSafe(finalMessageText);
    const formattedParts = formatSummaryWithRawFallback(finalMessageText);

    if (formattedParts.length === 1) {
      const finalizedInPlace = await liveStream.finalizeCurrentMessage(sessionId, {
        format,
        includeKeyboard: keyboardManager.isInitialized(target.scopeKey),
        rawFallbackText: formattedParts[0]?.rawFallbackText,
        renderedPart: finalParts[0],
        finalText: finalMessageText,
      });

      if (finalizedInPlace) {
        const ttsSent = await sendTtsResponseForSession({
          api: activeBot.api,
          sessionId,
          chatId: target.chatId,
          threadId: target.threadId,
          text: normalizedMessageText,
        });
        clearPromptResponseMode(sessionId);

        logger.debug("[Bot] Assistant completion finalized in place", {
          sessionId,
          ttsSent,
        });
        assistantRunState.finishRun(sessionId, "final_delivery_in_place");
        return;
      }
    }

    for (let index = 0; index < finalParts.length; index++) {
      const isLastPart = index === finalParts.length - 1;

      // Bounded 429 retries: a persistent storm fails this delivery (and the
      // coordinator reschedules) instead of wedging the session chain.
      await runWithRateLimitRetries(`final:${sessionId}`, () =>
        sendBotRenderedPart({
          api: activeBot.api,
          chatId: target.chatId,
          part: finalParts[index],
          options: {
            link_preview_options: {
              is_disabled: !isDisplayVisible(DISPLAY_FLAG.LINK_PREVIEWS, target.scopeKey),
            },
            ...(isLastPart && keyboardManager.isInitialized(target.scopeKey)
              ? { reply_markup: keyboardManager.getKeyboard(target.scopeKey) }
              : {}),
            disable_notification: !isLastPart,
            ...getThreadSendOptions(target.threadId),
          },
        }),
      );
    }

    const ttsSent = await sendTtsResponseForSession({
      api: activeBot.api,
      sessionId,
      chatId: target.chatId,
      threadId: target.threadId,
      text: normalizedMessageText,
    });
    clearPromptResponseMode(sessionId);

    // The answer went out as fresh messages: remove the live stream message
    // (service lines included) instead of leaving it next to the finals.
    await liveStream.deleteLiveMessage(sessionId);

    logger.debug("[Bot] Assistant completion finalized", {
      sessionId,
      partCount: finalParts.length,
      ttsSent,
    });
    assistantRunState.finishRun(sessionId, "final_delivery_sent");
  } catch (err) {
    clearPromptResponseMode(sessionId);
    logger.error("Failed to send message to Telegram:", err);
    logger.warn("[Bot] Assistant message delivery failed; keeping event processing active");
    throw err;
  }
}

function syncKeyboardContextFromPinnedState(scopeKey: string): void {
  const contextInfo = contextStateManager.get(scopeKey);
  if (!contextInfo) {
    keyboardManager.clearContext(scopeKey);
    return;
  }

  keyboardManager.updateContext(contextInfo.tokensUsed, contextInfo.tokensLimit, scopeKey);
}

const liveKeyboardRepostByScope = new Map<string, { at: number; percent: number }>();
const LIVE_KEYBOARD_REPOST_MIN_INTERVAL_MS = 30_000;
const LIVE_KEYBOARD_REPOST_MIN_PERCENT_DELTA = 5;
const LIVE_KEYBOARD_REPOST_MAX_SCOPES = 200;
const TYPING_INDICATOR_MIN_INTERVAL_MS = 5_000;
const lastTypingIndicatorByScope = new Map<string, number>();

/** Records a repost baseline, evicting the oldest scope when the map grows. */
function trackLiveKeyboardRepost(scopeKey: string, at: number, percent: number): void {
  liveKeyboardRepostByScope.set(scopeKey, { at, percent });
  while (liveKeyboardRepostByScope.size > LIVE_KEYBOARD_REPOST_MAX_SCOPES) {
    const oldest = liveKeyboardRepostByScope.keys().next();
    if (oldest.done) {
      break;
    }
    liveKeyboardRepostByScope.delete(oldest.value);
  }
}

/**
 * Reposts the reply keyboard mid-run so its context button stops lagging a
 * full turn behind. Reply keyboards cannot be edited in place: Telegram only
 * swaps them when a new message carries reply_markup, and stream edits never
 * do. To avoid spamming the topic, reposts happen only while a live stream
 * message is on screen, at most every 30s, and only once the displayed
 * percent moved by at least 5 points (identical markups are also skipped by
 * the manager fingerprint).
 */
async function refreshLiveKeyboardProgress(sessionId: string): Promise<void> {
  const target = getTargetBySessionId(sessionId);
  if (!target || !botInstance) {
    return;
  }

  if (!keyboardManager.isInitialized(target.scopeKey)) {
    return;
  }

  if (liveStream.getLiveMessageId(sessionId) === null) {
    return;
  }

  const contextInfo = contextStateManager.get(target.scopeKey);
  if (!contextInfo || contextInfo.tokensLimit <= 0) {
    return;
  }

  const percent = Math.round((contextInfo.tokensUsed / contextInfo.tokensLimit) * 100);
  const now = Date.now();
  const last = liveKeyboardRepostByScope.get(target.scopeKey);
  if (last && now - last.at < LIVE_KEYBOARD_REPOST_MIN_INTERVAL_MS) {
    return;
  }
  if (last && Math.abs(percent - last.percent) < LIVE_KEYBOARD_REPOST_MIN_PERCENT_DELTA) {
    return;
  }
  trackLiveKeyboardRepost(target.scopeKey, now, percent);

  try {
    await keyboardManager.sendKeyboardUpdate(target.chatId, target.scopeKey);
  } catch (error) {
    logger.debug("[Bot] Failed to repost live keyboard", { sessionId, error });
  }
}

/**
 * Records the keyboard state delivered with the final message, so the next
 * turn does not repost an identical keyboard on its first tokens event.
 */
function seedLiveKeyboardRepostBaseline(scopeKey: string): void {
  const contextInfo = contextStateManager.get(scopeKey);
  if (!contextInfo || contextInfo.tokensLimit <= 0) {
    return;
  }

  trackLiveKeyboardRepost(
    scopeKey,
    Date.now(),
    Math.round((contextInfo.tokensUsed / contextInfo.tokensLimit) * 100),
  );
}

async function sendSessionTextMessage(
  sessionId: string,
  text: string,
  format: "raw" | "markdown_v2" = "raw",
  _includeKeyboard: boolean = false,
): Promise<number | null> {
  if (!botInstance) {
    return null;
  }

  const target = getTargetBySessionId(sessionId);
  if (!target) {
    return null;
  }

  const activeBot = botInstance;
  if (!activeBot) {
    return null;
  }

  // NOTE: never attach the reply keyboard here. Telegram does not allow
  // editing the text of a message sent with a reply keyboard ("message
  // can't be edited"), which would kill the whole live stream. The keyboard
  // refreshes through final messages and silent reposts instead.
  const message = await sendBotText({
    api: activeBot.api,
    chatId: target.chatId,
    text,
    options: {
      disable_notification: true,
      ...getThreadSendOptions(target.threadId),
    },
    format,
  });

  return message.message_id;
}

async function editSessionTextMessage(
  sessionId: string,
  messageId: number,
  text: string,
  format: "raw" | "markdown_v2" = "raw",
  _includeKeyboard: boolean = false,
  rawFallbackText?: string,
): Promise<void> {
  if (!botInstance) {
    return;
  }

  const target = getTargetBySessionId(sessionId);
  if (!target) {
    return;
  }

  const activeBot = botInstance;
  if (!activeBot) {
    return;
  }

  try {
    await editBotText({
      api: activeBot.api,
      chatId: target.chatId,
      messageId,
      text,
      rawFallbackText,
      format,
    });
  } catch (error) {
    if (isTelegramMessageNotModifiedError(error)) {
      logger.debug("[Bot] Suppressing no-op message edit", {
        sessionId,
        messageId,
      });
      return;
    }

    throw error;
  }
}

async function deleteSessionMessage(sessionId: string, messageId: number): Promise<void> {
  if (!botInstance) {
    return;
  }

  const target = getTargetBySessionId(sessionId);
  if (!target) {
    return;
  }

  const activeBot = botInstance;
  if (!activeBot) {
    return;
  }

  await activeBot.api.deleteMessage(target.chatId, messageId);
}

async function sendSessionCodeBlockMessage(
  sessionId: string,
  fileData: { filename: string; buffer: Buffer; caption: string },
): Promise<boolean> {
  if (!botInstance) {
    return false;
  }

  const target = getTargetBySessionId(sessionId);
  if (!target) {
    return false;
  }

  // Long files go out as several code blocks so content stays readable
  // inline; documents are only a last resort for binary content.
  const blocks = buildCodeBlockMessages(
    fileData.caption,
    fileData.filename,
    fileData.buffer.toString("utf8"),
  );
  if (blocks.length === 0) {
    return false;
  }

  // Too many blocks would flood the topic: fall back to the .txt document
  // so very long files stay one message. Short files always render inline.
  if (blocks.length > MAX_CODE_BLOCK_MESSAGES) {
    logger.debug(
      `[Bot] File too long for code blocks (${blocks.length} messages): ${fileData.filename}, falling back to document`,
    );
    return false;
  }

  const activeBot = botInstance;
  for (const block of blocks) {
    const codeEntity = {
      type: "pre" as const,
      offset: block.codeOffset,
      length: block.codeLength,
      ...(block.language ? { language: block.language } : {}),
    };

    try {
      // Bounded 429 retries; any other send error falls back to document.
      await runWithRateLimitRetries(`codeblock:${fileData.filename}`, () =>
        activeBot.api.sendMessage(target.chatId, block.text, {
          entities: [codeEntity],
          disable_notification: true,
          ...getThreadSendOptions(target.threadId),
        }),
      );
    } catch (error) {
      if (error instanceof RateLimitExceededError) {
        throw error;
      }
      logger.debug("[Bot] Code block send failed; falling back to document", {
        sessionId,
        filename: fileData.filename,
        error,
      });
      return false;
    }
  }

  logger.debug(
    `[Bot] Sent code block: ${fileData.filename} (${blocks.length} message(s), session=${sessionId})`,
  );
  return true;
}

async function sendSessionDocumentMessage(
  sessionId: string,
  fileData: { filename: string; buffer: Buffer; caption: string },
): Promise<void> {
  if (!botInstance) {
    return;
  }

  const target = getTargetBySessionId(sessionId);
  if (!target) {
    return;
  }

  const activeBot = botInstance;
  if (!activeBot) {
    return;
  }

  // Bot API limits: bots cannot send files larger than 50MB, and captions
  // are cut at 1024 chars. Fail fast with a clear log instead of a raw 400.
  const TELEGRAM_BOT_MAX_FILE_BYTES = 50 * 1024 * 1024;
  const TELEGRAM_CAPTION_LIMIT = 1024;
  if (fileData.buffer.length > TELEGRAM_BOT_MAX_FILE_BYTES) {
    logger.warn("[Bot] Skipping document send: file exceeds Telegram 50MB bot limit", {
      sessionId,
      filename: fileData.filename,
      bytes: fileData.buffer.length,
    });
    return;
  }
  const caption =
    fileData.caption.length > TELEGRAM_CAPTION_LIMIT
      ? `${fileData.caption.slice(0, TELEGRAM_CAPTION_LIMIT - 1)}…`
      : fileData.caption;

  logger.debug(
    `[Bot] Sending code file: ${fileData.filename} (${fileData.buffer.length} bytes, session=${sessionId})`,
  );

  await runWithRateLimitRetries(`document:${fileData.filename}`, () =>
    activeBot.api.sendDocument(
      target.chatId,
      new InputFile(fileData.buffer, fileData.filename),
      {
        caption,
        disable_notification: true,
        ...getThreadSendOptions(target.threadId),
      },
    ),
  );
}

const liveStream = new LiveStream({
  throttleMs: config.bot.responseStreamThrottleMs,
  sendText: async (
    sessionId: string,
    text: string,
    format: "raw" | "markdown_v2" = "raw",
    includeKeyboard: boolean = false,
  ) => await sendSessionTextMessage(sessionId, text, format, includeKeyboard),
  editText: async (
    sessionId: string,
    messageId: number,
    text: string,
    format: "raw" | "markdown_v2" = "raw",
    includeKeyboard: boolean = false,
    rawFallbackText?: string,
  ) =>
    await editSessionTextMessage(
      sessionId,
      messageId,
      text,
      format,
      includeKeyboard,
      rawFallbackText,
    ),
  editRenderedPart: async (sessionId, messageId, part, _includeKeyboard = false) => {
    if (!botInstance) {
      return;
    }

    const target = getTargetBySessionId(sessionId);
    if (!target) {
      return;
    }

    await editBotRenderedPart({
      api: botInstance.api,
      chatId: target.chatId,
      messageId,
      part,
    });
  },
  deleteText: deleteSessionMessage,
});

async function ensureCommandsInitialized(ctx: Context, next: NextFunction): Promise<void> {
  if (!ctx.from || ctx.from.id !== config.telegram.allowedUserId) {
    await next();
    return;
  }

  if (!ctx.chat) {
    logger.warn("[Bot] Cannot initialize commands: chat context is missing");
    await next();
    return;
  }

  if (initializedCommandChats.has(ctx.chat.id)) {
    await next();
    return;
  }

  try {
    if (ctx.chat.type === CHAT_TYPE.PRIVATE) {
      await ctx.api.setMyCommands(getLocalizedDmBotCommands(), {
        scope: {
          type: "chat",
          chat_id: ctx.chat.id,
        },
      });
    } else {
      await ctx.api.setMyCommands(BOT_COMMANDS, {
        scope: {
          type: "chat_member",
          chat_id: ctx.chat.id,
          user_id: ctx.from.id,
        },
      });
    }

    initializedCommandChats.add(ctx.chat.id);
    logger.info(
      `[Bot] Commands initialized for authorized user in chat (chat_id=${ctx.chat.id}, user_id=${ctx.from.id})`,
    );
  } catch (err) {
    logger.error("[Bot] Failed to set commands:", err);
  }

  await next();
}

export async function ensureEventSubscription(directory: string): Promise<void> {
  if (!directory) {
    logger.error("No directory found for event subscription");
    return;
  }

  // Background session tracker is shared (see getSharedBackgroundTracker):
  // the SSE stream is global, so one tracker replaces the old
  // per-subscription clones that notified N times.
  getSharedBackgroundTracker();

  summaryAggregator.setOnCleared(() => {
    sessionOutputCoordinator.clearAll();
    void liveStream.clearAll("summary_aggregator_clear");
    sharedBackgroundTracker?.clear();
  });

  summaryAggregator.setOnMessageUpdated((sessionId, messageId, messageText) => {
    sessionOutputCoordinator.dispatch({
      kind: "assistant_update",
      sessionId,
      messageId,
      text: messageText,
    });
  });

  summaryAggregator.setOnComplete((sessionId, messageId, messageText) => {
    sessionOutputCoordinator.dispatch({
      kind: "assistant_complete",
      sessionId,
      messageId,
      text: messageText,
    });
  });

  summaryAggregator.setOnTool(async (toolInfo) => {
    const toolTarget = getTargetBySessionId(toolInfo.sessionId);
    const toolScopeKey = toolTarget?.scopeKey;
    sessionOutputCoordinator.dispatch({
      kind: "tool",
      sessionId: toolInfo.sessionId,
      toolInfo,
      visibleToUser:
        isDisplayVisible(
          DISPLAY_FLAG.TOOL_CALLS,
          toolScopeKey,
        ) &&
        !FILE_MUTATION_TOOLS.has(toolInfo.tool) &&
        toolInfo.tool !== "task",
    });
    if (toolTarget && botInstance) {
      const input = toolInfo.input as { command?: unknown; code?: unknown } | undefined;
      const commandPreview =
        typeof input?.command === "string"
          ? input.command
          : typeof input?.code === "string"
            ? input.code
            : toolInfo.tool;
      noteToolBackgroundState({
        api: botInstance.api,
        sessionId: toolInfo.sessionId,
        callId: toolInfo.callId,
        tool: toolInfo.tool,
        status:
          "status" in toolInfo.state
            ? (toolInfo.state.status as string | undefined)
            : undefined,
        commandPreview,
        chatId: toolTarget.chatId,
        threadId: toolTarget.threadId,
      });
    } else if (toolInfo.tool === "bash" || toolInfo.tool === "execute") {
      logger.debug("[BackgroundOffer] Skipping offer: no topic target for session", {
        sessionId: toolInfo.sessionId,
      });
    }
  });

  summaryAggregator.setOnSubagent((sessionId, subagents) => {
    sessionOutputCoordinator.dispatch({
      kind: "subagent",
      sessionId,
      subagents,
      visibleToUser: isDisplayVisible(
        DISPLAY_FLAG.TOOL_CALLS,
        getTargetBySessionId(sessionId)?.scopeKey,
      ),
    });
  });

  summaryAggregator.setOnToolFile(async (fileInfo) => {
    sessionOutputCoordinator.dispatch({
      kind: "tool_file",
      sessionId: fileInfo.sessionId,
      fileInfo,
    });
  });

  summaryAggregator.setOnQuestion((sessionId, questions, requestID) => {
    sessionOutputCoordinator.dispatch({
      kind: "question",
      sessionId,
      questions,
      requestId: requestID,
    });
  });

  summaryAggregator.setOnQuestionSettled((sessionId, requestID, outcome) => {
    if (!sessionId || !requestID || !botInstance) {
      return;
    }

    const target = getTargetBySessionId(sessionId);
    if (!target) {
      return;
    }

    const activeBot = botInstance;
    safeBackgroundTask({
      taskName: "question.settled_from_event",
      task: () =>
        closeQuestionSettledOutside(
          activeBot.api,
          target.chatId,
          target.scopeKey,
          requestID,
          outcome,
        ),
      onError: (error) => {
        logger.debug("[Bot] Failed to settle question poll from event:", error);
      },
    });
  });

  summaryAggregator.setOnQuestionError(async () => {
    logger.info(`[Bot] Question tool failed, clearing active poll and deleting messages`);

    const bindings = listAllTopicBindings();
    for (const binding of bindings) {
      const messageIds = questionManager.getMessageIds(binding.scopeKey);
      for (const messageId of messageIds) {
        await botInstance?.api.deleteMessage(binding.chatId, messageId).catch((err) => {
          logger.error(`[Bot] Failed to delete question message ${messageId}:`, err);
        });
      }

      clearAllInteractionState(INTERACTION_CLEAR_REASON.QUESTION_ERROR, binding.scopeKey);
    }

    clearAllInteractionState(INTERACTION_CLEAR_REASON.QUESTION_ERROR, GLOBAL_SCOPE_KEY);
  });

  summaryAggregator.setOnPermission((request) => {
    sessionOutputCoordinator.dispatch({
      kind: "permission",
      sessionId: request.sessionID,
      request,
    });
  });

  summaryAggregator.setOnPermissionReplied((sessionId, requestID) => {
    if (!requestID || !botInstance) {
      return;
    }

    permissionManager.markSettled(requestID);
    cancelScheduledPermissionPoll(requestID);
    const activeBot = botInstance;
    safeBackgroundTask({
      taskName: "permission.settled_from_event",
      task: async () => {
        let matched = false;
        for (const scopeKey of permissionManager.getActiveScopeKeys()) {
          const match = permissionManager.getRequestByID(requestID, scopeKey);
          if (!match) {
            continue;
          }

          matched = true;
          const target = getTargetBySessionId(match.request.sessionID);
          if (!target) {
            logger.warn(
              `[Bot] Dropping permission state without a topic target: requestID=${requestID}, session=${match.request.sessionID}`,
            );
          } else {
            logger.info(
              `[Bot] Marking Telegram permission poll settled outside: requestID=${requestID}, session=${sessionId ?? match.request.sessionID}`,
            );
            await activeBot.api
              .editMessageText(
                target.chatId,
                match.messageId,
                buildPermissionOutcomeText(match.request, "settled_outside"),
              )
              .catch(() => {});
          }

          permissionManager.removeByMessageId(match.messageId, scopeKey);
          syncPermissionInteractionState(scopeKey, {});
          return;
        }

        if (!matched) {
          logger.debug(
            `[Bot] Permission settled outside has no local poll: requestID=${requestID}, session=${sessionId ?? "unknown"}`,
          );
        }
      },
      onError: (error) => {
        logger.debug("[Bot] Failed to settle permission poll from event:", error);
      },
    });
  });

  summaryAggregator.setOnTypingIndicator((sessionId) => {
    if (!botInstance) {
      return;
    }

    const target = getTargetBySessionId(sessionId);
    if (!target) {
      return;
    }

    // Typing events fire per SSE event; throttle per scope so a busy turn
    // cannot flood Telegram (sendChatAction bypasses the rate-limiter queue).
    const now = Date.now();
    const lastTypingAt = lastTypingIndicatorByScope.get(target.scopeKey) ?? 0;
    if (now - lastTypingAt < TYPING_INDICATOR_MIN_INTERVAL_MS) {
      return;
    }
    lastTypingIndicatorByScope.set(target.scopeKey, now);
    if (lastTypingIndicatorByScope.size > LIVE_KEYBOARD_REPOST_MAX_SCOPES) {
      const oldest = lastTypingIndicatorByScope.keys().next();
      if (!oldest.done) {
        lastTypingIndicatorByScope.delete(oldest.value);
      }
    }

    void botInstance.api
      .sendChatAction(
        target.chatId,
        TELEGRAM_CHAT_ACTION.TYPING,
        getChatActionThreadOptions(target.threadId),
      )
      .catch((error) => {
        logger.debug("[Bot] Failed to send typing indicator", {
          sessionId,
          chatId: target.chatId,
          threadId: target.threadId,
          error,
        });
      });
  });

  summaryAggregator.setOnThinking(async (sessionId) => {
    sessionOutputCoordinator.dispatch({
      kind: "thinking",
      sessionId,
      visibleToUser: isDisplayVisible(
        DISPLAY_FLAG.THINKING,
        getTargetBySessionId(sessionId)?.scopeKey,
      ),
    });
  });

  summaryAggregator.setOnTokens(async (sessionId, tokens) => {
    const target = getTargetBySessionId(sessionId);
    if (!target) {
      logger.debug("[Bot] Ignoring tokens for session without a topic target", { sessionId });
      return;
    }

    try {
      logger.debug(`[Bot] Received tokens: input=${tokens.input}, output=${tokens.output}`);

      if (tokens.cost > 0) {
        recordSessionCost(sessionId, tokens.cost);
        const day = todayKey();
        const dayTotal = addDailyCost(day, tokens.cost);
        if (shouldAlertBudget(day, dayTotal, config.cost.budgetAlertUsd)) {
          await botInstance?.api
            .sendMessage(
              target.chatId,
              t("cost.budget_alert", {
                today: formatUsd(dayTotal),
                budget: formatUsd(config.cost.budgetAlertUsd),
              }),
              getThreadSendOptions(target.threadId),
            )
            .catch(() => {});
        }
      }

      // Update keyboardManager SYNCHRONOUSLY before any await
      // This ensures keyboard has correct context when onComplete sends the reply
      const contextSize = tokens.input + tokens.cacheRead;
      let contextLimit = pinnedMessageManager.getContextLimit(target.scopeKey);
      // Sanity gate: the live window can never exceed the model limit.
      // Anything bigger is cumulative accounting leaking into the display.
      // Refresh first: the cached limit may be stale after a model switch.
      if (contextLimit > 0 && contextSize > contextLimit) {
        await pinnedMessageManager.refreshContextLimit(target.scopeKey).catch(() => {});
        contextLimit = pinnedMessageManager.getContextLimit(target.scopeKey);
        if (contextLimit > 0 && contextSize > contextLimit) {
          logger.warn("[Bot] Ignoring implausible context size", {
            sessionId,
            contextSize,
            contextLimit,
          });
          return;
        }
      }
      if (contextLimit > 0) {
        keyboardManager.updateContext(contextSize, contextLimit, target.scopeKey);
      }

      if (pinnedMessageManager.isInitialized(target.scopeKey)) {
        await pinnedMessageManager.onMessageComplete(tokens, target.scopeKey);

        if (contextLimit <= 0) {
          contextLimit = pinnedMessageManager.getContextLimit(target.scopeKey);
          if (contextLimit > 0) {
            keyboardManager.updateContext(contextSize, contextLimit, target.scopeKey);
          }
        }
      }

      // Live stream edits never carry reply_markup, so without this the visible
      // keyboard would freeze at the turn-start numbers until final delivery.
      await refreshLiveKeyboardProgress(sessionId);
    } catch (err) {
      logger.error("[Bot] Error updating pinned message with tokens:", err);
    }
  });

  summaryAggregator.setOnSessionCompacted(async (sessionId, directory) => {
    const target = getTargetBySessionId(sessionId);
    if (!target || !pinnedMessageManager.isInitialized(target.scopeKey)) {
      return;
    }

    try {
      logger.info(`[Bot] Session compacted, reloading context: ${sessionId}`);
      await pinnedMessageManager.onSessionCompacted(sessionId, directory, target.scopeKey);
      syncKeyboardContextFromPinnedState(target.scopeKey);
      await pinnedMessageManager.flush(target.scopeKey);

      if (consumePendingCompactionNotice(sessionId)) {
        const contextInfo = contextStateManager.get(target.scopeKey);
        const keyboard = keyboardManager.isInitialized(target.scopeKey)
          ? keyboardManager.getKeyboard(target.scopeKey)
          : undefined;
        const contextText = contextInfo
          ? t("context.after_compaction", { context: formatContextForButton(contextInfo) })
          : t("context.success");

        await botInstance?.api.sendMessage(target.chatId, contextText, {
          ...(keyboard ? { reply_markup: keyboard } : {}),
          ...getThreadSendOptions(target.threadId),
        });
      }
    } catch (err) {
      logger.error("[Bot] Error reloading context after compaction:", err);
    }
  });

  summaryAggregator.setOnSessionIdle((sessionId) => {
    clearSessionBackgroundOffers(sessionId);
    sessionOutputCoordinator.dispatch({
      kind: "session_idle",
      sessionId,
    });
  });

  summaryAggregator.setOnSessionError(async (sessionId, message) => {
    sessionOutputCoordinator.dispatch({
      kind: "session_error",
      sessionId,
      message,
    });
  });

  summaryAggregator.setOnSessionRetry(async (retryInfo) => {
    sessionOutputCoordinator.dispatch({
      kind: "session_retry",
      sessionId: retryInfo.sessionId,
      retryInfo,
    });
  });

  summaryAggregator.setOnSessionDiff(async (sessionId, diffs) => {
    const target = getTargetBySessionId(sessionId);
    if (!target || !pinnedMessageManager.isInitialized(target.scopeKey)) {
      return;
    }

    try {
      await pinnedMessageManager.onSessionDiff(diffs, target.scopeKey);
    } catch (err) {
      logger.error("[Bot] Error updating session diff:", err);
    }
  });

  summaryAggregator.setOnFileChange((change, sessionId) => {
    const target = getTargetBySessionId(sessionId);
    if (!target || !pinnedMessageManager.isInitialized(target.scopeKey)) {
      return;
    }
    pinnedMessageManager.addFileChange(change, target.scopeKey);
  });

  // Single shared consumer: the SSE stream is global, so every directory
  // registers the same callback and each event is processed exactly once.
  const eventCallback = getSharedEventCallback();
  eventCallbackByDirectory.set(directory, eventCallback);
  logger.info(`[Bot] Subscribing to OpenCode events for project: ${directory}`);

  subscribeToEvents(directory, eventCallback).catch((err) => {
    logger.error("Failed to subscribe to events:", err);
  });
}

export async function subscribeToKnownProjects(): Promise<void> {
  const bindings = listAllTopicBindings();
  const directories = new Set<string>();

  for (const binding of bindings) {
    if (binding.projectWorktree) {
      directories.add(binding.projectWorktree);
    }

    // Keep topic-bound sessions tracked across service restarts so their
    // events reach Telegram without waiting for the next user action.
    // Ephemeral subagent transcripts are tracked as children, never roots.
    if (binding.sessionId && !binding.ephemeral) {
      summaryAggregator.setSession(binding.sessionId);
    }
  }

  try {
    const cachedProjects = await getCachedSessionProjects();
    for (const project of cachedProjects) {
      if (project.worktree) {
        directories.add(project.worktree);
      }
    }
  } catch (error) {
    logger.debug(
      "[Bot] Failed to read cached session projects for event subscription",
      error,
    );
  }

  for (const directory of directories) {
    ensureEventSubscription(directory).catch((error) => {
      logger.error(
        "[Bot] Failed to subscribe to known project events",
        { directory },
        error,
      );
    });
  }
}

async function prepareSessionForPrompt(sessionId: string): Promise<void> {
  await sessionOutputCoordinator.flushPendingFinalDelivery(sessionId);
  await liveStream.sealCurrentMessage(sessionId, true);
}

export function createBot(): Bot<Context> {
  clearAllInteractionState(INTERACTION_CLEAR_REASON.BOT_STARTUP);

  const botOptions: ConstructorParameters<typeof Bot<Context>>[1] = {};

  if (config.telegram.proxyUrl) {
    const proxyUrl = config.telegram.proxyUrl;
    let agent;

    if (proxyUrl.startsWith("socks")) {
      agent = new SocksProxyAgent(proxyUrl);
      logger.info(`[Bot] Using SOCKS proxy: ${proxyUrl.replace(/\/\/.*@/, "//***@")}`);
    } else {
      agent = new HttpsProxyAgent(proxyUrl);
      logger.info(`[Bot] Using HTTP/HTTPS proxy: ${proxyUrl.replace(/\/\/.*@/, "//***@")}`);
    }

    botOptions.client = {
      baseFetchConfig: {
        agent,
        compress: true,
      },
    };
  }

  const bot = new Bot(config.telegram.token, botOptions);
  bindBotInstance(bot);

  bot.api.config.use((prev, method, payload, signal) => {
    return telegramRateLimiter.enqueue(method, payload, () => prev(method, payload, signal));
  });

  // Heartbeat for diagnostics: verify the event loop is not blocked
  let heartbeatCounter = 0;
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
  }
  heartbeatTimer = setInterval(() => {
    heartbeatCounter++;
    if (heartbeatCounter % 6 === 0) {
      // Log every 30 seconds (5 sec * 6)
      logger.debug(`[Bot] Heartbeat #${heartbeatCounter} - event loop alive`);
    }
  }, 5000);

  // Log all API calls for diagnostics
  let lastGetUpdatesTime = Date.now();
  bot.api.config.use(async (prev, method, payload, signal) => {
    if (method === "getUpdates") {
      const now = Date.now();
      const timeSinceLast = now - lastGetUpdatesTime;
      logger.debug(`[Bot API] getUpdates called (${timeSinceLast}ms since last)`);
      lastGetUpdatesTime = now;
    } else if (method === "sendMessage") {
      logger.debug(`[Bot API] sendMessage to chat ${(payload as { chat_id?: number }).chat_id}`);
    }
    return prev(method, payload, signal);
  });

  bot.use((ctx, next) => {
    bindBotInstance(bot);
    rememberScopeTarget(ctx);

    const hasCallbackQuery = !!ctx.callbackQuery;
    const hasMessage = !!ctx.message;
    const callbackData = ctx.callbackQuery?.data || "N/A";
    logger.debug(
      `[DEBUG] Incoming update: hasCallbackQuery=${hasCallbackQuery}, hasMessage=${hasMessage}, callbackData=${callbackData}`,
    );
    return next();
  });

  bot.use(authMiddleware);
  bot.use(async (ctx, next) => {
    if (ctx.message && ctx.chat?.type !== CHAT_TYPE.PRIVATE) {
      await ensureGeneralTopicName(ctx);
    }

    await next();
  });
  bot.use(ensureCommandsInitialized);
  bot.use(interactionGuardMiddleware);
  bot.use(scheduledOutputTopicMiddleware);
  bot.use(async (ctx, next) => {
    if (ctx.chat?.type !== CHAT_TYPE.PRIVATE) {
      await next();
      return;
    }

    const text = ctx.message?.text;
    if (text) {
      const commandName = extractCommandName(text);
      if (commandName) {
        if (DM_ALLOWED_COMMAND_SET.has(commandName)) {
          await next();
          return;
        }

        await ctx.reply(t("dm.restricted.command"));
        return;
      }

      await ctx.reply(t("dm.restricted.prompt"));
      return;
    }

    if (ctx.message?.photo || ctx.message?.document || ctx.message?.voice || ctx.message?.audio) {
      await ctx.reply(t("dm.restricted.prompt"));
      return;
    }

    await next();
  });

  const blockMenuWhileInteractionActive = async (
    ctx: Context,
    menuKind?: "agent" | "model" | "variant" | "context",
  ): Promise<boolean> => {
    const activeInteraction = interactionManager.getSnapshot(
      getScopeFromContext(ctx)?.key ?? GLOBAL_SCOPE_KEY,
    );
    if (!activeInteraction) {
      return false;
    }

    const taskStage = String(activeInteraction.metadata.stage ?? "");
    const allowTaskDraftDefaultChange =
      activeInteraction.kind === "task" &&
      activeInteraction.expectedInput === "mixed" &&
      taskStage === "prompt" &&
      (menuKind === "agent" || menuKind === "model" || menuKind === "variant");

    if (allowTaskDraftDefaultChange) {
      return false;
    }

    logger.debug(
      `[Bot] Blocking menu open while interaction active: kind=${activeInteraction.kind}, expectedInput=${activeInteraction.expectedInput}`,
    );
    await ctx.reply(
      activeInteraction.kind === "task"
        ? t("task.blocked.only_defaults_before_prompt")
        : t("interaction.blocked.finish_current"),
    );
    return true;
  };

  bot.command(BOT_COMMAND.START, startCommand);
  bot.command(BOT_COMMAND.HELP, helpCommand);
  bot.command(BOT_COMMAND.STATUS, statusCommand);
  bot.command(BOT_COMMAND.REFRESH, handleRefreshCommand);
  bot.command(BOT_COMMAND.DISPLAY, displayCommand);
  bot.command(BOT_COMMAND.QUEUE, queueCommand);
  bot.command(BOT_COMMAND.TRUST, trustCommand);
  bot.command(BOT_COMMAND.RETRY, createRetryCommand({ bot, ensureEventSubscription }));
  bot.command(BOT_COMMAND.DIFF, diffCommand);
  bot.command(BOT_COMMAND.COMMIT, commitCommand);
  bot.command(BOT_COMMAND.COST, costCommand);
  bot.command(BOT_COMMAND.CLOSE, closeCommand);
  bot.command(BOT_COMMAND.FORK, createForkCommand({ ensureEventSubscription }));
  bot.command(BOT_COMMAND.SHARE, shareCommand);
  bot.command(BOT_COMMAND.SAVED, createSavedCommand({ bot, ensureEventSubscription }));
  bot.command(BOT_COMMAND.LAST, lastCommand);
  bot.command(BOT_COMMAND.TTS, ttsCommand);
  bot.command(BOT_COMMAND.OPENCODE_START, opencodeStartCommand);
  bot.command(BOT_COMMAND.OPENCODE_STOP, opencodeStopCommand);
  bot.command(BOT_COMMAND.RELOAD, reloadCommand);
  bot.command(BOT_COMMAND.PROJECTS, projectsCommand);
  bot.command(BOT_COMMAND.OPEN, openCommand);
  bot.command(BOT_COMMAND.TASK, taskCommand);
  bot.command(BOT_COMMAND.TASKLIST, taskListCommand);
  bot.command(BOT_COMMAND.SESSIONS, sessionsCommand);
  bot.command(BOT_COMMAND.RECENT, recentCommand);
  bot.command(BOT_COMMAND.NEW, createNewCommand({ ensureEventSubscription }));
  bot.command(BOT_COMMAND.ABORT, abortCommand);
  bot.command(BOT_COMMAND.RENAME, renameCommand);
  bot.command(BOT_COMMAND.COMMANDS, commandsCommand);
  bot.command(BOT_COMMAND.SKILLS, skillsCommand);

  bot.on("message:text", unknownCommandMiddleware);

  bot.on("callback_query:data", async (ctx) => {
    logger.debug(`[Bot] Received callback_query:data: ${ctx.callbackQuery?.data}`);
    logger.debug(`[Bot] Callback context: from=${ctx.from?.id}, chat=${ctx.chat?.id}`);

    if (ctx.chat) {
      botInstance = bot;
      rememberScopeTarget(ctx);
    }

    try {
      const handledInlineCancel = await handleInlineMenuCancel(ctx);
      const handledQuestion = await handleQuestionCallback(ctx);
      const handledPermission = await handlePermissionCallback(ctx);
      const handledDisplay = await handleDisplayCallback(ctx);
      const handledToolBackground = await handleToolBackgroundCallback(ctx);
      const callbackScopeKey = getScopeFromContext(ctx)?.key;
      if (
        !handledQuestion &&
        !handledPermission &&
        !handledToolBackground &&
        callbackScopeKey &&
        isEphemeralTopicScope(callbackScopeKey)
      ) {
        // Transcript-only subagent topics: polls and display stay usable,
        // everything else that would mutate scope state or create sessions
        // is rejected with a toast instead of running.
        await ctx.answerCallbackQuery({ text: t("subagent.topic_readonly") }).catch(() => {});
        return;
      }
      const handledQueuedCancel = await handleQueuedPromptCancel(ctx);
      const handledQueuedFront = await handleQueuedPromptFront(ctx);
      const handledQueuedSteer = await handleQueuedPromptSteer(ctx);
      const handledQueue = await handleQueueCallback(ctx);
      const handledTrust = await handleTrustCallback(ctx);
      const handledSession = await handleSessionSelect(ctx);
      const handledRecent = await handleRecentSelect(ctx);
      const handledProject = await handleProjectSelect(ctx);
      const handledOpen = await handleOpenCallback(ctx);
      const handledTaskList = await handleTaskListCallback(ctx);
      const handledRefreshCommand = await handleRefreshCommand(ctx);
      const handledAgent = await handleAgentSelect(ctx);
      const handledModel = await handleModelSelect(ctx);
      const handledVariant = await handleVariantSelect(ctx);
      const handledCompactConfirm = await handleCompactConfirm(ctx);
      const handledRenameCancel = await handleRenameCancel(ctx);
      const handledCommands = await handleCommandsCallback(ctx, { ensureEventSubscription });
      
      const handledSkills = await handleSkillsCallback(ctx, {
        bot,
        ensureEventSubscription,
        prepareSessionForPrompt,
      });

      logger.debug(
        `[Bot] Callback handled: inlineCancel=${handledInlineCancel}, queuedCancel=${handledQueuedCancel}, queuedFront=${handledQueuedFront}, queuedSteer=${handledQueuedSteer}, queue=${handledQueue}, trust=${handledTrust}, toolBackground=${handledToolBackground}, display=${handledDisplay}, session=${handledSession}, recent=${handledRecent}, project=${handledProject}, open=${handledOpen}, taskList=${handledTaskList}, question=${handledQuestion}, permission=${handledPermission}, agent=${handledAgent}, model=${handledModel}, variant=${handledVariant}, compactConfirm=${handledCompactConfirm}, rename=${handledRenameCancel}, commands=${handledCommands}, skills=${handledSkills}`,
      );

      if (
        !handledInlineCancel &&
        !handledQueuedCancel &&
        !handledQueuedFront &&
        !handledQueuedSteer &&
        !handledQueue &&
        !handledTrust &&
        !handledToolBackground &&
        !handledDisplay &&
        !handledSession &&
        !handledRecent &&
        !handledProject &&
        !handledOpen &&
        !handledTaskList &&
        !handledQuestion &&
        !handledPermission &&

        !handledAgent &&
        !handledModel &&
        !handledVariant &&
        !handledCompactConfirm &&
        !handledRenameCancel &&
        !handledCommands &&
        !handledRefreshCommand &&
        !handledSkills
      ) {
        logger.debug("Unknown callback query:", ctx.callbackQuery?.data);
        await ctx.answerCallbackQuery({ text: t("callback.unknown_command") }).catch(() => {});
      }
    } catch (err) {
      logger.error("[Bot] Error handling callback:", err);
      clearAllInteractionState(
        INTERACTION_CLEAR_REASON.CALLBACK_HANDLER_ERROR,
        getScopeFromContext(ctx)?.key ?? GLOBAL_SCOPE_KEY,
      );
      await ctx.answerCallbackQuery({ text: t("callback.processing_error") }).catch(() => {});
    }
  });

  // Handle Reply Keyboard button press (agent indicator)
  bot.hears(AGENT_MODE_BUTTON_TEXT_PATTERN, async (ctx) => {
    logger.debug(`[Bot] Agent mode button pressed: ${ctx.message?.text}`);

    try {
      if (await blockMenuWhileInteractionActive(ctx, "agent")) {
        return;
      }

      await showAgentSelectionMenu(ctx);
    } catch (err) {
      logger.error("[Bot] Error showing agent menu:", err);
      await ctx.reply(t("error.load_agents"));
    }
  });

  // Handle Reply Keyboard button press (model selector)
  // Model button text is produced by formatModelForButton() and always starts with "🤖 ".
  bot.hears(MODEL_BUTTON_TEXT_PATTERN, async (ctx) => {
    logger.debug(`[Bot] Model button pressed: ${ctx.message?.text}`);

    try {
      if (await blockMenuWhileInteractionActive(ctx, "model")) {
        return;
      }

      await showModelSelectionMenu(ctx);
    } catch (err) {
      logger.error("[Bot] Error showing model menu:", err);
      await ctx.reply(t("error.load_models"));
    }
  });

  bot.hears(t("keyboard.general_defaults"), async (ctx) => {
    await ctx.reply(
      t("keyboard.general_defaults_info"),
      getThreadSendOptions(getScopeFromContext(ctx)?.threadId ?? null),
    );
  });

  // Handle Reply Keyboard button press (context button)
  bot.hears(/^📊(?:\s|$)/, async (ctx) => {
    logger.debug(`[Bot] Context button pressed: ${ctx.message?.text}`);

    try {
      if (await blockMenuWhileInteractionActive(ctx, "context")) {
        return;
      }

      await handleContextButtonPress(ctx);
    } catch (err) {
      logger.error("[Bot] Error handling context button:", err);
      await ctx.reply(t("error.context_button"));
    }
  });

  // Handle Reply Keyboard button press (variant selector)
  // Keep support for both legacy "💭" and current "💡" prefix.
  bot.hears(VARIANT_BUTTON_TEXT_PATTERN, async (ctx) => {
    logger.debug(`[Bot] Variant button pressed: ${ctx.message?.text}`);

    try {
      if (await blockMenuWhileInteractionActive(ctx, "variant")) {
        return;
      }

      await showVariantSelectionMenu(ctx);
    } catch (err) {
      logger.error("[Bot] Error showing variant menu:", err);
      await ctx.reply(t("error.load_variants"));
    }
  });

  bot.on("message:text", async (ctx, next) => {
    const text = ctx.message?.text;
    if (text) {
      const isCommand = text.startsWith("/");
      logger.debug(
        `[Bot] Received text message: ${isCommand ? `command="${text}"` : `prompt (length=${text.length})`}, chatId=${ctx.chat.id}`,
      );
    }
    await next();
  });

  // Remove any previously set global commands to prevent unauthorized users from seeing them
  safeBackgroundTask({
    taskName: "bot.clearGlobalCommands",
    task: async () => {
      try {
        await Promise.all([
          bot.api.setMyCommands([], { scope: { type: "default" } }),
          bot.api.setMyCommands([], { scope: { type: "all_private_chats" } }),
        ]);
        return { success: true as const };
      } catch (error) {
        return { success: false as const, error };
      }
    },
    onSuccess: (result) => {
      if (result.success) {
        logger.info("[Bot] Cleared global commands (default and all_private_chats scopes)");
        return;
      }

      logger.warn("[Bot] Could not clear global commands:", result.error);
    },
  });

  // Voice and audio message handlers (STT transcription -> prompt)
  const voicePromptDeps = { bot, ensureEventSubscription, prepareSessionForPrompt };

  bot.on("message:voice", async (ctx) => {
    logger.debug(`[Bot] Received voice message, chatId=${ctx.chat.id}`);
    botInstance = bot;
    rememberScopeTarget(ctx);

    const scopeKey = getScopeFromContext(ctx)?.key ?? GLOBAL_SCOPE_KEY;
    if (questionManager.isActive(scopeKey)) {
      await handleVoiceMessage(ctx, {
        ...voicePromptDeps,
        processPrompt: async (voiceCtx, text) => {
          await handleQuestionTextAnswer(voiceCtx, text);
          return true;
        },
      });
      return;
    }

    if (isGroupGeneralControlScope(ctx)) {
      await replyGeneralControlPromptRestriction(ctx);
      return;
    }

    if (await replyEphemeralTopicReadonly(ctx)) {
      return;
    }

    await handleVoiceMessage(ctx, voicePromptDeps);
  });

  bot.on("message:audio", async (ctx) => {
    logger.debug(`[Bot] Received audio message, chatId=${ctx.chat.id}`);
    botInstance = bot;
    rememberScopeTarget(ctx);

    const scopeKey = getScopeFromContext(ctx)?.key ?? GLOBAL_SCOPE_KEY;
    if (questionManager.isActive(scopeKey)) {
      await handleVoiceMessage(ctx, {
        ...voicePromptDeps,
        processPrompt: async (voiceCtx, text) => {
          await handleQuestionTextAnswer(voiceCtx, text);
          return true;
        },
      });
      return;
    }

    if (isGroupGeneralControlScope(ctx)) {
      await replyGeneralControlPromptRestriction(ctx);
      return;
    }

    if (await replyEphemeralTopicReadonly(ctx)) {
      return;
    }

    await handleVoiceMessage(ctx, voicePromptDeps);
  });

  // Photo message handler
  bot.on("message:photo", async (ctx) => {
    logger.debug(`[Bot] Received photo message, chatId=${ctx.chat.id}`);

    if (isGroupGeneralControlScope(ctx)) {
      await replyGeneralControlPromptRestriction(ctx);
      return;
    }

    if (await replyEphemeralTopicReadonly(ctx)) {
      return;
    }

    const photos = ctx.message?.photo;
    if (!photos || photos.length === 0) {
      return;
    }

    const caption = ctx.message.caption || "";

    try {
      // Get the largest photo (last element in array)
      const largestPhoto = photos[photos.length - 1];

      // Check model capabilities
      const scopeKey = getScopeFromContext(ctx)?.key ?? GLOBAL_SCOPE_KEY;
      const storedModel = getStoredModel(scopeKey);
      const capabilities = await getModelCapabilities(storedModel.providerID, storedModel.modelID);

      if (!supportsInput(capabilities, "image")) {
        logger.warn(
          `[Bot] Model ${storedModel.providerID}/${storedModel.modelID} doesn't support image input`,
        );
        await ctx.reply(t("bot.photo_model_no_image"));

        // Fall back to caption-only if present
        if (caption.trim().length > 0) {
          botInstance = bot;
          rememberScopeTarget(ctx);
          const promptDeps = { bot, ensureEventSubscription, prepareSessionForPrompt };
          await processUserPrompt(ctx, caption, promptDeps);
        }
        return;
      }

      // Download photo
      await ctx.reply(t("bot.photo_downloading"));
      const downloadedFile = await downloadTelegramFile(ctx.api, largestPhoto.file_id);

      // Convert to data URI (Telegram always converts photos to JPEG)
      const dataUri = toDataUri(downloadedFile.buffer, "image/jpeg");

      // Create file part
      const filePart: FilePartInput = {
        type: "file",
        mime: "image/jpeg",
        filename: "photo.jpg",
        url: dataUri,
      };

      logger.info(`[Bot] Sending photo (${downloadedFile.buffer.length} bytes) with prompt`);

      botInstance = bot;
      rememberScopeTarget(ctx);

      // Send via processUserPrompt with file part
      const promptDeps = { bot, ensureEventSubscription, prepareSessionForPrompt };
      await processUserPrompt(ctx, caption, promptDeps, [filePart]);
    } catch (err) {
      logger.error("[Bot] Error handling photo message:", err);
      await ctx.reply(t("bot.photo_download_error"));
    }
  });

  // Document message handler (PDF and text files)
  bot.on("message:document", async (ctx) => {
    logger.debug(`[Bot] Received document message, chatId=${ctx.chat.id}`);
    botInstance = bot;
    rememberScopeTarget(ctx);

    if (isGroupGeneralControlScope(ctx)) {
      await replyGeneralControlPromptRestriction(ctx);
      return;
    }

    if (await replyEphemeralTopicReadonly(ctx)) {
      return;
    }

    const deps = { bot, ensureEventSubscription, prepareSessionForPrompt };
    await handleDocumentMessage(ctx, deps);
  });

  bot.on("message:text", async (ctx) => {
    const text = ctx.message?.text;
    if (!text) {
      return;
    }

    botInstance = bot;
    rememberScopeTarget(ctx);

    if (text.startsWith("/")) {
      return;
    }

    const scopeKey = getScopeFromContext(ctx)?.key ?? GLOBAL_SCOPE_KEY;

    if (questionManager.isActive(scopeKey)) {
      await handleQuestionTextAnswer(ctx);
      return;
    }

    const handledRename = await handleRenameTextAnswer(ctx);
    if (handledRename) {
      return;
    }

    const handledTask = await handleTaskTextAnswer(ctx);
    if (handledTask) {
      return;
    }

    // Transcript-only subagent topics reject new prompts (poll answers
    // were already handled above).
    if (await replyEphemeralTopicReadonly(ctx)) {
      return;
    }

    if (taskCreationManager.isActive(scopeKey) && isReplyKeyboardControlText(text)) {
      logger.debug("[Bot] Ignoring reply keyboard control text during task setup");
      return;
    }

    const promptDeps = { bot, ensureEventSubscription, prepareSessionForPrompt };
    const handledCommandArgs = await handleCommandTextArguments(ctx, promptDeps);
    if (handledCommandArgs) {
      return;
    }

    const handledSkillArgs = await handleSkillTextArguments(ctx, promptDeps);
    if (handledSkillArgs) {
      return;
    }

    const handledModelSearch = await handleModelSearchTextAnswer(ctx);
    if (handledModelSearch) {
      return;
    }

    if (isGroupGeneralControlScope(ctx)) {
      await replyGeneralControlPromptRestriction(ctx);
      return;
    }

    await processUserPrompt(ctx, text, promptDeps);

    logger.debug("[Bot] message:text handler completed (prompt sent in background)");
  });

  bot.catch((err) => {
    logger.error("[Bot] Unhandled error in bot:", err);
    clearAllInteractionState(
      "bot_unhandled_error",
      err.ctx ? (getScopeFromContext(err.ctx)?.key ?? GLOBAL_SCOPE_KEY) : GLOBAL_SCOPE_KEY,
    );
    if (err.ctx) {
      logger.error(
        "[Bot] Error context - update type:",
        err.ctx.update ? Object.keys(err.ctx.update) : "unknown",
      );
    }
  });

  return bot;
}

export function cleanupBotRuntime(reason: string): void {
  summaryAggregator.clear();
  sessionOutputCoordinator.clearAll();
  void liveStream.clearAll(reason);
  stopEventListening();
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  eventCallbackByDirectory.clear();
  sharedEventCallback = null;
  sharedBackgroundTracker = null;
  clearAllBackgroundOffers();
  initializedCommandChats.clear();
  renamedGeneralTopicChats.clear();
  botInstance = null;
}
