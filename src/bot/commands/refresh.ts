import { Context } from "grammy";
import { opencodeClient } from "../../opencode/client.js";
import { getCurrentSession } from "../../session/manager.js";
import { getCurrentProject } from "../../settings/manager.js";
import { summaryAggregator } from "../../summary/aggregator.js";
import { getScopeFromContext, getScopeKeyFromContext, getThreadSendOptions } from "../scope.js";
import { logger } from "../../utils/logger.js";
import { getTopicBindingBySessionId, registerTopicSessionBinding } from "../../topic/manager.js";
import { ensureEventSubscription } from "../index.js";
import { t } from "../../i18n/index.js";
import { buildTopicMessageLink } from "../utils/topic-link.js";

export async function handleRefreshCommand(ctx: Context): Promise<boolean> {
  if (ctx.callbackQuery) {
    return false;
  }

  const scopeKey = getScopeKeyFromContext(ctx);
  const scope = getScopeFromContext(ctx);

  const currentSession = getCurrentSession(scopeKey);
  if (!currentSession) {
    await ctx.reply(t("sessions.select_error"), getThreadSendOptions(scope?.threadId ?? null));
    return true;
  }

  const project = getCurrentProject(scopeKey);
  if (!project) {
    await ctx.reply(t("sessions.select_project_first"), getThreadSendOptions(scope?.threadId ?? null));
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
          buildTopicMessageLink(
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
        preview: lastMessageText.length > 50 ? `${lastMessageText.substring(0, 50)}...` : lastMessageText,
        link: topicLink || t("refresh.no_topic"),
      })
    : t("refresh.subscribed", {
        link: topicLink || t("refresh.no_topic"),
      });

  await ctx.reply(confirmMsg, getThreadSendOptions(scope?.threadId ?? null));

  return true;
}
