import { CommandContext, Context } from "grammy";
import { opencodeClient } from "../../opencode/client.js";
import { clearAllInteractionState } from "../../interaction/cleanup.js";
import { INTERACTION_CLEAR_REASON } from "../../interaction/constants.js";
import { getCurrentSession } from "../../session/manager.js";
import { interactionManager } from "../../interaction/manager.js";
import { TOPIC_SESSION_STATUS } from "../../settings/manager.js";
import { summaryAggregator } from "../../summary/aggregator.js";
import { updateTopicBindingStatusBySessionId } from "../../topic/manager.js";
import { t } from "../../i18n/index.js";
import { logger } from "../../utils/logger.js";
import { getScopeFromContext, getScopeKeyFromContext, getThreadSendOptions } from "../scope.js";
import { clearPromptResponseMode } from "../handlers/prompt.js";
import { cancelAllScheduledPermissionPolls } from "../handlers/permission.js";
import { assistantRunState } from "../assistant-run-state.js";

type SessionState = "idle" | "busy" | "not-found";

export interface AbortCurrentOperationOptions {
  notifyUser?: boolean;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function stopLocalStreaming(scopeKey: string, sessionId?: string): void {
  clearAllInteractionState(INTERACTION_CLEAR_REASON.STOP_COMMAND, scopeKey);
  // A permission poll scheduled during the grace window belongs to the
  // aborted turn: letting it pop afterwards invites a reply for a request
  // that died with the abort.
  cancelAllScheduledPermissionPolls(scopeKey);

  if (!sessionId) {
    return;
  }

  assistantRunState.clearRun(sessionId, "abort");
  summaryAggregator.clearSession(sessionId);
  updateTopicBindingStatusBySessionId(sessionId, TOPIC_SESSION_STATUS.ABANDONED);
}

async function pollSessionStatus(
  sessionId: string,
  directory: string,
  maxWaitMs: number = 5000,
): Promise<SessionState> {
  const startedAt = Date.now();
  const pollIntervalMs = 500;

  while (Date.now() - startedAt < maxWaitMs) {
    try {
      const { data, error } = await opencodeClient.session.status({ directory });

      if (error || !data) {
        break;
      }

      const sessionStatus = (data as Record<string, { type?: string }>)[sessionId];
      if (!sessionStatus) {
        return "not-found";
      }

      if (sessionStatus.type === "idle" || sessionStatus.type === "error") {
        return "idle";
      }

      if (sessionStatus.type !== "busy") {
        return "not-found";
      }

      await sleep(pollIntervalMs);
    } catch (error) {
      logger.warn("[Abort] Failed to poll session status:", error);
      break;
    }
  }

  return "busy";
}

export async function abortCurrentOperation(
  ctx: CommandContext<Context> | Context,
  options: AbortCurrentOperationOptions = {},
): Promise<void> {
  const scopeKey = getScopeKeyFromContext(ctx);
  const threadOptions = getThreadSendOptions(getScopeFromContext(ctx)?.threadId ?? null);
  const currentSession = getCurrentSession(scopeKey);
  const activeInteraction = interactionManager.getSnapshot(scopeKey);

  if (!currentSession) {
    stopLocalStreaming(scopeKey);
    if (options.notifyUser !== false) {
      await ctx.reply(
        activeInteraction ? t("stop.cancelled_interaction") : t("stop.no_active_session"),
        threadOptions,
      );
    }
    return;
  }

  stopLocalStreaming(scopeKey, currentSession.id);
  clearPromptResponseMode(currentSession.id);

  const waitingMessage =
    options.notifyUser === false
      ? null
      : await ctx.reply(t("stop.in_progress"), threadOptions);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const { data: abortResult, error: abortError } = await opencodeClient.session.abort(
      {
        sessionID: currentSession.id,
        directory: currentSession.directory,
      },
      { signal: controller.signal },
    );

    clearTimeout(timeoutId);

    if (options.notifyUser === false) {
      if (abortError) {
        logger.warn("[Abort] Abort request failed during silent abort:", abortError);
      }
      return;
    }

    if (abortError) {
      logger.warn("[Abort] Abort request failed:", abortError);
      await ctx.api.editMessageText(
        ctx.chat!.id,
        waitingMessage!.message_id,
        t("stop.warn_unconfirmed"),
      );
      return;
    }

    if (abortResult !== true) {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        waitingMessage!.message_id,
        t("stop.warn_maybe_finished"),
      );
      return;
    }

    const finalStatus = await pollSessionStatus(currentSession.id, currentSession.directory, 5000);

    if (finalStatus === "idle" || finalStatus === "not-found") {
      await ctx.api.editMessageText(ctx.chat!.id, waitingMessage!.message_id, t("stop.success"));
    } else {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        waitingMessage!.message_id,
        t("stop.warn_still_busy"),
      );
    }
  } catch (error) {
    clearTimeout(timeoutId);

    if (options.notifyUser === false) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        logger.error("[Abort] Error while aborting session during silent abort:", error);
      }
      return;
    }

    if (!ctx.chat || !waitingMessage) {
      logger.error("[Abort] Cannot report abort failure: no chat context", { error });
      return;
    }

    if (error instanceof Error && error.name === "AbortError") {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        waitingMessage!.message_id,
        t("stop.warn_timeout"),
      );
    } else {
      logger.error("[Abort] Error while aborting session:", error);
      await ctx.api.editMessageText(
        ctx.chat!.id,
        waitingMessage!.message_id,
        t("stop.warn_local_only"),
      );
    }
  }
}

export async function abortCommand(ctx: CommandContext<Context>) {
  try {
    await abortCurrentOperation(ctx);
  } catch (error) {
    logger.error("[Abort] Unexpected error:", error);
    await ctx.reply(
      t("stop.error"),
      getThreadSendOptions(getScopeFromContext(ctx)?.threadId ?? null),
    );
  }
}
