import { Context } from "grammy";
import { opencodeClient } from "../../opencode/client.js";
import { getCurrentSession, setCurrentSession } from "../../session/manager.js";
import { getCurrentProject, TOPIC_SESSION_STATUS } from "../../settings/manager.js";
import { summaryAggregator } from "../../summary/aggregator.js";
import { getScopeFromContext, getScopeKeyFromContext, getThreadSendOptions } from "../scope.js";
import { logger } from "../../utils/logger.js";
import {
  getTopicBindingByScopeKey,
  getTopicBindingBySessionId,
  registerTopicSessionBinding,
  updateTopicBindingStatus,
} from "../../topic/manager.js";
import { ensureEventSubscription } from "../index.js";
import { t } from "../../i18n/index.js";
import { buildTopicThreadLink } from "../utils/topic-link.js";

export async function handleRefreshCommand(ctx: Context): Promise<boolean> {
  if (ctx.callbackQuery) {
    return false;
  }

  const scopeKey = getScopeKeyFromContext(ctx);
  const scope = getScopeFromContext(ctx);

  let currentSession = getCurrentSession(scopeKey);
  const project = getCurrentProject(scopeKey);
  if (!currentSession) {
    // Same reopen path as prompts: the topic was closed/abandoned but its
    // session may still exist on the server. Revive it so /refresh works
    // instead of dead-ending with select_error.
    const binding = ctx.chat ? getTopicBindingByScopeKey(scopeKey) : undefined;
    if (binding && ctx.chat && scope?.threadId != null && project) {
      try {
        const { data: session, error } = await opencodeClient.session.get({
          sessionID: binding.sessionId,
          directory: project.worktree,
        });
        if (!error && session) {
          logger.info(`[Refresh] Reopening topic: scope=${scopeKey}, session=${session.id}`);
          currentSession = {
            id: session.id,
            title: session.title,
            directory: project.worktree,
          };
          setCurrentSession(currentSession, scopeKey);
          updateTopicBindingStatus(ctx.chat.id, scope.threadId, TOPIC_SESSION_STATUS.ACTIVE);
        }
      } catch (err) {
        logger.warn("[Refresh] Failed to reopen topic session:", err);
      }
    }
  }
  if (!currentSession) {
    await ctx.reply(t("sessions.select_error"), getThreadSendOptions(scope?.threadId ?? null));
    return true;
  }

  if (!project) {
    await ctx.reply(
      t("sessions.select_project_first"),
      getThreadSendOptions(scope?.threadId ?? null),
    );
    return true;
  }

  const directory = project.worktree;
  if (!directory) {
    await ctx.reply(t("sessions.select_error"), getThreadSendOptions(scope?.threadId ?? null));
    return true;
  }

  // Re-track the session and force the event subscription so its events
  // reach Telegram even if the service restarted since it was selected.
  summaryAggregator.setSession(currentSession.id);
  await ensureEventSubscription(directory).catch((err) => {
    logger.error("[Refresh] Failed to subscribe to events:", err);
  });

  const lastMessageText: string = "";
  let topicLink = "";

  try {
    const { data: messages, error: listError } = await opencodeClient.session.list({
      directory,
      limit: 1,
    });

    if (listError || !messages) {
      logger.error("[Refresh] Failed to get session messages:", listError);
    } else if (messages.length > 0) {
      const binding = getTopicBindingBySessionId(currentSession.id);
      if (binding?.chatId != null && binding?.threadId != null) {
        topicLink =
          buildTopicThreadLink(
            { id: binding.chatId, type: "supergroup" } as unknown as Context["chat"],
            binding.threadId,
          ) ?? "";
      }
    }
  } catch (err) {
    logger.error("[Refresh] Error getting session state:", err);
  }

  const existingBinding = getTopicBindingBySessionId(currentSession.id);
  if (!existingBinding && ctx.chat) {
    try {
      await registerTopicSessionBinding({
        scopeKey,
        sessionId: currentSession.id,
        chatId: ctx.chat.id,
        threadId: scope?.threadId ?? 0,
        projectId: project.id,
        projectWorktree: directory,
      });
    } catch (err) {
      logger.error("[Refresh] Failed to register topic binding:", err);
    }
  }

  const confirmMsg = lastMessageText
    ? t("refresh.last_message", {
        preview:
          lastMessageText.length > 50 ? `${lastMessageText.substring(0, 50)}...` : lastMessageText,
        link: topicLink || t("refresh.no_topic"),
      })
    : t("refresh.subscribed", {
        link: topicLink || t("refresh.no_topic"),
      });

  await ctx.reply(confirmMsg, getThreadSendOptions(scope?.threadId ?? null));

  return true;
}
