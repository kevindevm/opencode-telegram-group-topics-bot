import { CommandContext, Context } from "grammy";
import { abortCurrentOperation } from "./abort.js";
import { getCurrentSession } from "../../session/manager.js";
import { getTopicBindingBySessionId } from "../../topic/manager.js";
import {
  TOPIC_SESSION_STATUS,
  updateTopicSessionBindingStatus,
} from "../../settings/manager.js";
import { pinnedMessageManager } from "../../pinned/manager.js";
import { keyboardManager } from "../../keyboard/manager.js";
import { t } from "../../i18n/index.js";
import { logger } from "../../utils/logger.js";
import { getScopeFromContext, getThreadSendOptions } from "../scope.js";
import { formatTopicTitle } from "../../topic/title-format.js";

export async function closeCommand(ctx: CommandContext<Context>): Promise<void> {
  const scope = getScopeFromContext(ctx);
  const scopeKey = scope?.key;
  const threadId = scope?.threadId ?? null;
  const threadOptions = getThreadSendOptions(threadId);

  if (!scopeKey || !ctx.chat || typeof threadId !== "number") {
    await ctx.reply(t("close.topic_only"), threadOptions);
    return;
  }

  const session = getCurrentSession(scopeKey);
  const binding = session ? getTopicBindingBySessionId(session.id) : undefined;
  if (!session || !binding) {
    await ctx.reply(t("close.no_topic_session"), threadOptions);
    return;
  }

  await abortCurrentOperation(ctx, { notifyUser: false });
  updateTopicSessionBindingStatus(`${ctx.chat.id}:${threadId}`, TOPIC_SESSION_STATUS.CLOSED);

  try {
    await pinnedMessageManager.clear(scopeKey);
  } catch (error) {
    logger.warn("[Close] Failed to clear pinned message:", error);
  }
  keyboardManager.clearScope(scopeKey);

  // formatTopicTitle strips markdown (raw ** would show literally in the
  // topic header) and truncates on code-point boundaries instead of
  // splitting surrogate pairs.
  const closedName = formatTopicTitle(t("close.topic_prefix", { name: binding.topicName ?? session.title }));
  try {
    await ctx.api.editForumTopic(ctx.chat.id, threadId, { name: closedName });
  } catch (error) {
    logger.warn("[Close] Failed to rename closed topic:", error);
  }

  await ctx.reply(t("close.done", { title: session.title }), threadOptions);
}
