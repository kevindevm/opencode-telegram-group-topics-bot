import { CommandContext, Context } from "grammy";
import { opencodeServerVersion, opencodeV2Client } from "../../opencode/client.js";
import { refreshModelCatalog } from "../../model/manager.js";
import { logger } from "../../utils/logger.js";
import { t } from "../../i18n/index.js";
import { safeBackgroundTask } from "../../utils/safe-background-task.js";
import { getScopeFromContext, getThreadSendOptions } from "../scope.js";

/**
 * Command handler for /reload (OpenCode V2 only).
 * Rebuilds every loaded server location from a fresh config; the rebuild runs in
 * the background so the bot keeps answering while it lasts. Adapted from upstream
 * OTB-123 to this fork's flat manager layout (no app container / model views).
 */
export async function reloadCommand(ctx: CommandContext<Context>): Promise<void> {
  const threadId = getScopeFromContext(ctx)?.threadId ?? null;

  if (opencodeServerVersion !== "v2") {
    await ctx.reply(t("reload.v1_not_supported"), getThreadSendOptions(threadId));
    return;
  }

  try {
    await ctx.reply(t("reload.reloading"), getThreadSendOptions(threadId));
  } catch (error) {
    logger.error("[Bot] Error in /reload command:", error);
    return;
  }

  safeBackgroundTask({
    taskName: "bot.reloadOpencodeConfig",
    task: async () => {
      const { error } = await opencodeV2Client.location.reload();
      if (error) {
        throw error;
      }
      await refreshModelCatalog();
    },
    onSuccess: () => {
      void ctx
        .reply(t("reload.success"), getThreadSendOptions(threadId))
        .catch((replyError: unknown) =>
          logger.error("[Bot] Error reporting /reload success:", replyError),
        );
    },
    onError: (error: unknown) => {
      logger.error("[Bot] Error in /reload command:", error);
      void ctx
        .reply(t("reload.failed"), getThreadSendOptions(threadId))
        .catch((replyError: unknown) =>
          logger.error("[Bot] Error reporting /reload failure:", replyError),
        );
    },
  });
}
