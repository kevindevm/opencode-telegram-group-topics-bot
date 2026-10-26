import { CommandContext, Context, InputFile } from "grammy";
import { getCurrentSession } from "../../session/manager.js";
import { loadSessionHistoryItems } from "../../session/history.js";
import { t } from "../../i18n/index.js";
import { logger } from "../../utils/logger.js";
import { getScopeFromContext, getThreadSendOptions } from "../scope.js";

function formatTranscriptMarkdown(
  title: string,
  items: Array<{ role: string; text: string }>,
): string {
  const lines = [`# ${title}`, ""];
  for (const item of items) {
    lines.push(item.role === "user" ? "## 🧑 You" : "## 🤖 Agent", "", item.text, "");
  }
  return lines.join("\n");
}

export async function shareCommand(ctx: CommandContext<Context>): Promise<void> {
  const scope = getScopeFromContext(ctx);
  const scopeKey = scope?.key;
  const session = scopeKey ? getCurrentSession(scopeKey) : undefined;
  const threadOptions = getThreadSendOptions(scope?.threadId ?? null);

  if (!session) {
    await ctx.reply(t("share.no_session"), threadOptions);
    return;
  }

  let items: Array<{ role: string; text: string }>;
  try {
    items = await loadSessionHistoryItems(session.id, session.directory);
  } catch (error) {
    logger.warn("[Share] Failed to load session history:", error);
    await ctx.reply(t("share.load_error"), threadOptions);
    return;
  }

  if (items.length === 0) {
    await ctx.reply(t("share.empty"), threadOptions);
    return;
  }

  const markdown = formatTranscriptMarkdown(session.title, items.slice(0, 200));
  const filename = `session-${session.id.slice(0, 8)}.md`;
  const chatId = ctx.chat?.id;
  if (!chatId) {
    logger.warn("[Share] Cannot send transcript: no chat context");
    return;
  }

  // Bot API limits: 50MB per file, 1024 chars per caption.
  const buffer = Buffer.from(markdown, "utf-8");
  if (buffer.length > 50 * 1024 * 1024) {
    logger.warn("[Share] Transcript too large to send", {
      bytes: buffer.length,
      sessionId: session.id,
    });
    await ctx.reply(t("share.too_large"), threadOptions);
    return;
  }
  const caption = t("share.caption", { title: session.title });
  const safeCaption = caption.length > 1024 ? `${caption.slice(0, 1023)}…` : caption;
  try {
    await ctx.api.sendDocument(chatId, new InputFile(buffer, filename), {
      caption: safeCaption,
      ...threadOptions,
    });
  } catch (error) {
    logger.error("[Share] Failed to send transcript:", error);
    await ctx.reply(t("share.send_error"), threadOptions);
  }
}
