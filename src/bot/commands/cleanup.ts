import { CommandContext, Context } from "grammy";
import { opencodeClient } from "../../opencode/client.js";
import { clearAllInteractionState } from "../../interaction/cleanup.js";
import { INTERACTION_CLEAR_REASON } from "../../interaction/constants.js";
import { keyboardManager } from "../../keyboard/manager.js";
import { pinnedMessageManager } from "../../pinned/manager.js";
import { listAllTopicBindings, removeTopicBinding } from "../../topic/manager.js";
import { t } from "../../i18n/index.js";
import { logger } from "../../utils/logger.js";
import { getScopeFromContext, getThreadSendOptions } from "../scope.js";

interface SessionStatuses {
  [sessionId: string]: { type?: string } | undefined;
}

/**
 * Deletes every subagent transcript (ephemeral) topic of the current group
 * chat, stopping their sessions first so nothing keeps burning tokens
 * headless. Regular session topics are never touched.
 */
export async function cleanupCommand(ctx: CommandContext<Context>): Promise<void> {
  const scope = getScopeFromContext(ctx);
  const threadOptions = getThreadSendOptions(scope?.threadId ?? null);

  if (!ctx.chat || ctx.chat.type === "private") {
    await ctx.reply(t("cleanup.requires_forum_general"), threadOptions);
    return;
  }

  const chatId = ctx.chat.id;
  const ephemeral = listAllTopicBindings().filter(
    (binding) => binding.ephemeral && binding.chatId === chatId,
  );

  if (ephemeral.length === 0) {
    await ctx.reply(t("cleanup.subagents_none"), threadOptions);
    return;
  }

  await abortRunningSubagentSessions(ephemeral);

  let deleted = 0;
  let failed = 0;

  for (const binding of ephemeral) {
    try {
      await ctx.api.deleteForumTopic(binding.chatId, binding.threadId);
      removeTopicBinding(binding.chatId, binding.threadId);
      clearAllInteractionState(
        INTERACTION_CLEAR_REASON.CLEANUP_SUBAGENT_TOPICS,
        binding.scopeKey,
      );
      keyboardManager.clearScope(binding.scopeKey);
      try {
        await pinnedMessageManager.clear(binding.scopeKey);
      } catch (error) {
        logger.warn("[Cleanup] Failed to clear pinned state for deleted topic:", error);
      }
      deleted += 1;
    } catch (error) {
      logger.warn("[Cleanup] Failed to delete subagent topic:", {
        chatId: binding.chatId,
        threadId: binding.threadId,
        sessionId: binding.sessionId,
        error,
      });
      failed += 1;
    }
  }

  await ctx.reply(t("cleanup.subagents_result", { deleted, failed }), threadOptions);
}

/**
 * Best-effort stop of child sessions still running: deleting the topic
 * alone would leave them running headless. Status is read once per
 * worktree; every failure path still allows the topic deletion below.
 */
async function abortRunningSubagentSessions(
  bindings: Array<{ sessionId: string; projectWorktree?: string }>,
): Promise<void> {
  const byWorktree = new Map<string, string[]>();
  for (const binding of bindings) {
    if (!binding.projectWorktree) {
      continue;
    }
    const sessionIds = byWorktree.get(binding.projectWorktree) ?? [];
    sessionIds.push(binding.sessionId);
    byWorktree.set(binding.projectWorktree, sessionIds);
  }

  for (const [worktree, sessionIds] of byWorktree) {
    let statuses: SessionStatuses = {};
    try {
      const { data, error } = await opencodeClient.session.status({ directory: worktree });
      if (!error && data) {
        statuses = data as SessionStatuses;
      }
    } catch (error) {
      logger.warn("[Cleanup] Failed to read session statuses, skipping aborts:", {
        worktree,
        error,
      });
      continue;
    }

    for (const sessionId of sessionIds) {
      if (statuses[sessionId]?.type !== "busy") {
        continue;
      }
      try {
        await opencodeClient.session.abort({ sessionID: sessionId, directory: worktree });
        logger.debug("[Cleanup] Aborted running subagent session before topic deletion", {
          sessionId,
        });
      } catch (error) {
        logger.warn("[Cleanup] Failed to abort subagent session, deleting topic anyway:", {
          sessionId,
          error,
        });
      }
    }
  }
}
