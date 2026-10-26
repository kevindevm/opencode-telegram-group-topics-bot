import { CommandContext, Context } from "grammy";
import {
  DISPLAY_AGENTS_CALLBACK,
  buildDisplayKeyboard,
  formatDisplayMenu,
  parseDisplayCallback,
  toggleDisplayFlag,
} from "../../display/manager.js";
import { t } from "../../i18n/index.js";
import { getScopeFromContext, getScopeKeyFromContext } from "../scope.js";
import {
  ensureActiveInlineMenu,
  replyWithInlineMenu,
} from "../handlers/inline-menu.js";
import { showAgentSelectionMenu } from "../handlers/agent.js";
import { fetchCurrentAgent } from "../../agent/manager.js";
import { logger } from "../../utils/logger.js";

export async function displayCommand(ctx: CommandContext<Context>): Promise<void> {
  try {
    const scopeKey = getScopeFromContext(ctx)?.key;
    const currentAgent = scopeKey
      ? await fetchCurrentAgent(scopeKey).catch(() => undefined)
      : undefined;
    await replyWithInlineMenu(ctx, {
      menuKind: "display",
      text: formatDisplayMenu(scopeKey),
      keyboard: buildDisplayKeyboard(scopeKey, currentAgent),
    });
  } catch (error) {
    logger.error("[Display] Failed to open display menu:", error);
    await ctx.reply(t("callback.processing_error")).catch(() => {});
  }
}

/** Handles display toggle buttons. Returns true when the callback was consumed. */
export async function handleDisplayCallback(ctx: Context): Promise<boolean> {
  const data = ctx.callbackQuery?.data ?? "";

  // Agent shortcut inside the display menu: swap to the agent picker.
  if (data === DISPLAY_AGENTS_CALLBACK) {
    const isActive = await ensureActiveInlineMenu(ctx, "display");
    if (!isActive) {
      return true;
    }
    await ctx.answerCallbackQuery().catch(() => {});
    await showAgentSelectionMenu(ctx);
    return true;
  }

  const flag = parseDisplayCallback(data);
  if (flag === null) {
    return false;
  }

  const scopeKey = getScopeFromContext(ctx)?.key;
  const isActive = await ensureActiveInlineMenu(ctx, "display");
  if (!isActive) {
    return true;
  }

  if (!toggleDisplayFlag(flag, scopeKey ?? getScopeKeyFromContext(ctx))) {
    await ctx.answerCallbackQuery({ text: t("callback.processing_error") }).catch(() => {});
    return true;
  }

  await ctx.answerCallbackQuery().catch(() => {});
  const currentAgent = scopeKey
    ? await fetchCurrentAgent(scopeKey).catch(() => undefined)
    : undefined;
  await ctx
    .editMessageText(formatDisplayMenu(scopeKey), {
      reply_markup: buildDisplayKeyboard(scopeKey, currentAgent),
    })
    .catch(() => {});
  return true;
}
