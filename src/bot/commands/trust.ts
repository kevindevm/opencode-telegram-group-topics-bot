import { CommandContext, Context, InlineKeyboard } from "grammy";
import {
  TRUST_LEVEL,
  getTrustLevel,
  isTrustLevel,
  setTrustLevel,
  type TrustLevel,
} from "../../permission/trust.js";
import { getCurrentSession } from "../../session/manager.js";
import type { I18nKey } from "../../i18n/en.js";
import { t } from "../../i18n/index.js";
import { getScopeFromContext, getThreadSendOptions } from "../scope.js";

export const TRUST_CALLBACK_PREFIX = "trust:set:";

const TRUST_LEVELS: TrustLevel[] = [TRUST_LEVEL.ASK, TRUST_LEVEL.EDITS, TRUST_LEVEL.ALL];

const TRUST_LEVEL_KEYS: Record<TrustLevel, I18nKey> = {
  [TRUST_LEVEL.ASK]: "trust.level.ask",
  [TRUST_LEVEL.EDITS]: "trust.level.edits",
  [TRUST_LEVEL.ALL]: "trust.level.all",
};

function buildTrustKeyboard(): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const level of TRUST_LEVELS) {
    keyboard.text(t(TRUST_LEVEL_KEYS[level]), `${TRUST_CALLBACK_PREFIX}${level}`).row();
  }
  return keyboard;
}

function describeTrust(level: TrustLevel): string {
  return t("trust.current", { level: t(TRUST_LEVEL_KEYS[level]) });
}

export async function trustCommand(ctx: CommandContext<Context>): Promise<void> {
  const scope = getScopeFromContext(ctx);
  const scopeKey = scope?.key;
  const session = scopeKey ? getCurrentSession(scopeKey) : undefined;
  const threadOptions = getThreadSendOptions(scope?.threadId ?? null);

  if (!session) {
    await ctx.reply(t("trust.no_session"), threadOptions);
    return;
  }

  const rawArg = (ctx.match ?? "").toString().trim().toLowerCase();
  if (rawArg) {
    if (!isTrustLevel(rawArg)) {
      await ctx.reply(t("trust.invalid"), threadOptions);
      return;
    }

    setTrustLevel(session.id, rawArg);
    await ctx.reply(describeTrust(rawArg), threadOptions);
    return;
  }

  await ctx.reply(t("trust.choose", { level: describeTrust(getTrustLevel(session.id)) }), {
    ...threadOptions,
    reply_markup: buildTrustKeyboard(),
  });
}

/** Handles trust level buttons. Returns true when consumed. */
export async function handleTrustCallback(ctx: Context): Promise<boolean> {
  const data = ctx.callbackQuery?.data ?? "";
  if (!data.startsWith(TRUST_CALLBACK_PREFIX)) {
    return false;
  }

  const level = data.slice(TRUST_CALLBACK_PREFIX.length);
  if (!isTrustLevel(level)) {
    return false;
  }

  const scopeKey = scopeKeyFromCallback(ctx);
  const session = scopeKey ? getCurrentSession(scopeKey) : undefined;
  if (!session) {
    await ctx.answerCallbackQuery({ text: t("trust.no_session") }).catch(() => {});
    return true;
  }

  setTrustLevel(session.id, level);
  await ctx.answerCallbackQuery({ text: t(TRUST_LEVEL_KEYS[level]) }).catch(() => {});
  await ctx.editMessageText(describeTrust(level)).catch(() => {});
  return true;
}

function scopeKeyFromCallback(ctx: Context): string | null {
  return getScopeFromContext(ctx)?.key ?? null;
}
