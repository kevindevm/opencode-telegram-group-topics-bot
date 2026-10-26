import { CommandContext, Context } from "grammy";
import { processUserPrompt, type ProcessPromptDeps } from "../handlers/prompt.js";
import {
  deleteSavedPrompt,
  listSavedPrompts,
  savePromptShortcut,
} from "../../settings/manager.js";
import { t } from "../../i18n/index.js";
import { getThreadSendOptions } from "../scope.js";

export function createSavedCommand(deps: ProcessPromptDeps) {
  return async function savedCommand(ctx: CommandContext<Context>): Promise<void> {
    const threadOptions = getThreadSendOptions(ctx.message?.message_thread_id ?? null);
    const raw = (ctx.match ?? "").toString().trim();
    const [sub, ...rest] = raw.split(/\s+/);
    const action = (sub ?? "").toLowerCase();
    const saved = listSavedPrompts();

    if (!action || action === "list") {
      if (saved.length === 0) {
        await ctx.reply(t("saved.empty"), threadOptions);
        return;
      }

      const lines = saved.map((entry) => `• ${entry.name}`);
      await ctx.reply(`${t("saved.title")}\n\n${lines.join("\n")}`, threadOptions);
      return;
    }

    if (action === "add") {
      const name = rest.shift() ?? "";
      const text = rest.join(" ").trim();
      if (!name || !text) {
        await ctx.reply(t("saved.add_usage"), threadOptions);
        return;
      }

      savePromptShortcut(name, text);
      await ctx.reply(t("saved.added", { name }), threadOptions);
      return;
    }

    if (action === "del") {
      const name = rest.join(" ").trim();
      if (!name) {
        await ctx.reply(t("saved.del_usage"), threadOptions);
        return;
      }

      const removed = deleteSavedPrompt(name);
      await ctx.reply(
        removed ? t("saved.deleted", { name }) : t("saved.missing", { name }),
        threadOptions,
      );
      return;
    }

    if (action === "run") {
      const name = rest.join(" ").trim();
      const entry = saved.find((candidate) => candidate.name.toLowerCase() === name.toLowerCase());
      if (!entry) {
        await ctx.reply(t("saved.missing", { name: name || "?" }), threadOptions);
        return;
      }

      await processUserPrompt(ctx, entry.text, deps);
      return;
    }

    await ctx.reply(t("saved.usage"), threadOptions);
  };
}
