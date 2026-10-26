import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CommandContext, Context } from "grammy";
import { opencodeClient } from "../../opencode/client.js";
import { getCurrentSession } from "../../session/manager.js";
import { t } from "../../i18n/index.js";
import { logger } from "../../utils/logger.js";
import { getScopeFromContext, getThreadSendOptions } from "../scope.js";

const execFileAsync = promisify(execFile);

type SessionDiffEntry = {
  file?: string;
  path?: string;
  additions?: number;
  deletions?: number;
};

export async function diffCommand(ctx: CommandContext<Context>): Promise<void> {
  const scope = getScopeFromContext(ctx);
  const scopeKey = scope?.key;
  const session = scopeKey ? getCurrentSession(scopeKey) : undefined;
  const threadOptions = getThreadSendOptions(scope?.threadId ?? null);

  if (!session) {
    await ctx.reply(t("diff.no_session"), threadOptions);
    return;
  }

  let entries: SessionDiffEntry[];
  try {
    const { data, error } = await opencodeClient.session.diff({
      sessionID: session.id,
      directory: session.directory,
    });

    if (error || !data) {
      logger.warn("[Diff] Failed to load session diff:", error);
      await ctx.reply(t("diff.load_error"), threadOptions);
      return;
    }

    entries = data as SessionDiffEntry[];
  } catch (err) {
    logger.warn("[Diff] Failed to load session diff:", err);
    await ctx.reply(t("diff.load_error"), threadOptions);
    return;
  }

  const lines = entries
    .map((entry) => entry.file ?? entry.path ?? "")
    .filter((file) => file.length > 0)
    .map((file) => {
      const match = entries.find((entry) => (entry.file ?? entry.path) === file);
      const additions = match?.additions ?? 0;
      const deletions = match?.deletions ?? 0;
      return `• ${file} (+${additions} -${deletions})`;
    });

  if (lines.length === 0) {
    await ctx.reply(t("diff.empty"), threadOptions);
    return;
  }

  await ctx.reply(t("diff.title", { title: session.title }) + "\n\n" + lines.join("\n"), threadOptions);
}

async function runGit(worktree: string, args: string[]): Promise<{ stdout: string }> {
  const { stdout } = await execFileAsync("git", ["-C", worktree, ...args], {
    timeout: 30000,
    maxBuffer: 1024 * 1024,
  });
  return { stdout: stdout.trim() };
}

export async function commitCommand(ctx: CommandContext<Context>): Promise<void> {
  const scope = getScopeFromContext(ctx);
  const scopeKey = scope?.key;
  const session = scopeKey ? getCurrentSession(scopeKey) : undefined;
  const threadOptions = getThreadSendOptions(scope?.threadId ?? null);

  if (!session) {
    await ctx.reply(t("commit.no_session"), threadOptions);
    return;
  }

  const message = (ctx.match ?? "").toString().trim();
  if (!message) {
    await ctx.reply(t("commit.need_message"), threadOptions);
    return;
  }

  try {
    await runGit(session.directory, ["add", "-A"]);
    const status = await runGit(session.directory, ["status", "--porcelain"]);
    if (!status.stdout) {
      await ctx.reply(t("commit.nothing"), threadOptions);
      return;
    }

    await runGit(session.directory, ["commit", "-m", message]);
    const { stdout: hash } = await runGit(session.directory, ["rev-parse", "--short", "HEAD"]);
    await ctx.reply(t("commit.success", { hash }), threadOptions);
  } catch (err) {
    logger.error("[Commit] Git commit failed:", err);
    await ctx.reply(t("commit.error"), threadOptions);
  }
}
