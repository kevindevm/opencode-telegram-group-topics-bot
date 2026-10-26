import { CommandContext, Context, InlineKeyboard } from "grammy";
import {
  QUEUED_PROMPT_CANCEL_PREFIX,
  clearQueuedPrompts,
  listQueuedPrompts,
} from "../handlers/prompt.js";
import { getCurrentSession } from "../../session/manager.js";
import { t } from "../../i18n/index.js";
import { getScopeFromContext, getThreadSendOptions } from "../scope.js";

export const QUEUE_CLEAR_ALL_CALLBACK = "queue:clearall";

function buildQueueKeyboard(queue: Array<{ queueId: string }>): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  queue.forEach((entry, index) => {
    keyboard
      .text(`❌ #${index + 1}`, `${QUEUED_PROMPT_CANCEL_PREFIX}${entry.queueId}`)
      .row();
  });
  keyboard.text(t("queue.clear_button"), QUEUE_CLEAR_ALL_CALLBACK);

  return keyboard;
}

function formatQueueList(queue: Array<{ preview: string }>, title: string): string {
  const lines = queue.map((entry, index) => `#${index + 1}. ${entry.preview}`);
  return `${title}\n\n${lines.join("\n")}`;
}

export async function queueCommand(ctx: CommandContext<Context>): Promise<void> {
  const scope = getScopeFromContext(ctx);
  const scopeKey = scope?.key;
  const session = scopeKey ? getCurrentSession(scopeKey) : undefined;
  const threadOptions = getThreadSendOptions(scope?.threadId ?? null);

  if (!session) {
    await ctx.reply(t("queue.no_session"), threadOptions);
    return;
  }

  const queue = listQueuedPrompts(session.id);
  if (queue.length === 0) {
    await ctx.reply(t("queue.empty"), threadOptions);
    return;
  }

  await ctx.reply(formatQueueList(queue, t("queue.title", { title: session.title })), {
    ...threadOptions,
    reply_markup: buildQueueKeyboard(queue),
  });
}

/** Handles the queue "clear all" button. Item ❌ buttons reuse the cancel handler. */
export async function handleQueueCallback(ctx: Context): Promise<boolean> {
  if (ctx.callbackQuery?.data !== QUEUE_CLEAR_ALL_CALLBACK) {
    return false;
  }

  const scope = getScopeFromContext(ctx);
  const session = scope?.key ? getCurrentSession(scope.key) : undefined;
  if (!session) {
    await ctx.answerCallbackQuery({ text: t("queue.no_session") }).catch(() => {});
    return true;
  }

  const removed = clearQueuedPrompts(session.id);
  await ctx.answerCallbackQuery({ text: t("queue.cleared", { count: String(removed) }) }).catch(() => {});
  await ctx.editMessageText(t("queue.cleared_message", { count: String(removed) })).catch(() => {});
  return true;
}
