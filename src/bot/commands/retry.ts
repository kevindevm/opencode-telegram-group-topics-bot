import { CommandContext, Context } from "grammy";
import { processUserPrompt, type ProcessPromptDeps } from "../handlers/prompt.js";
import { getCurrentSession } from "../../session/manager.js";
import { loadLastUserMessage } from "../../session/history.js";
import { t } from "../../i18n/index.js";
import { getScopeFromContext, getThreadSendOptions } from "../scope.js";
import { logger } from "../../utils/logger.js";

export function createRetryCommand(deps: ProcessPromptDeps) {
  return async function retryCommand(ctx: CommandContext<Context>): Promise<void> {
    const scope = getScopeFromContext(ctx);
    const scopeKey = scope?.key;
    const session = scopeKey ? getCurrentSession(scopeKey) : undefined;
    const threadOptions = getThreadSendOptions(scope?.threadId ?? null);

    if (!session) {
      await ctx.reply(t("retry.no_session"), threadOptions);
      return;
    }

    const edited = (ctx.match ?? "").toString().trim();
    if (edited) {
      await processUserPrompt(ctx, edited, deps);
      return;
    }

    let lastUser: Awaited<ReturnType<typeof loadLastUserMessage>>;
    try {
      lastUser = await loadLastUserMessage(session.id, session.directory);
    } catch (error) {
      logger.warn("[Retry] Failed to load last user message:", error);
      await ctx.reply(t("retry.load_error"), threadOptions);
      return;
    }

    if (!lastUser) {
      await ctx.reply(t("retry.empty"), threadOptions);
      return;
    }

    await ctx.reply(t("retry.resending", { preview: lastUser.text.slice(0, 280) }), threadOptions);
    await processUserPrompt(ctx, lastUser.text, deps);
  };
}
