import { CommandContext, Context } from "grammy";
import { opencodeClient } from "../../opencode/client.js";
import { getStoredAgent, resolveProjectAgent } from "../../agent/manager.js";
import { getStoredModel } from "../../model/manager.js";
import { setCurrentSession, type SessionInfo } from "../../session/manager.js";
import { projectDirectoryExists } from "../../project/directory.js";
import { formatSessionDisplayTitle } from "../../session/title-format.js";
import {
  TOPIC_SESSION_STATUS,
  getCurrentProject,
  setCurrentAgent,
  setCurrentModel,
  setCurrentProject,
} from "../../settings/manager.js";
import { summaryAggregator } from "../../summary/aggregator.js";
import { pinnedMessageManager } from "../../pinned/manager.js";
import { keyboardManager } from "../../keyboard/manager.js";
import { createMainKeyboard } from "../utils/keyboard.js";
import { formatVariantForButton } from "../../variant/manager.js";
import {
  GLOBAL_SCOPE_KEY,
  SCOPE_CONTEXT,
  createScopeKeyFromParams,
  getScopeFromContext,
  getThreadSendOptions,
} from "../scope.js";
import { BOT_I18N_KEY } from "../constants.js";
import { getTopicBindingBySessionId, registerTopicSessionBinding } from "../../topic/manager.js";
import { TOPIC_COLORS } from "../../topic/colors.js";
import { formatTopicTitle } from "../../topic/title-format.js";
import { buildTopicMessageLink } from "../utils/topic-link.js";
import {
  isGeneralForumScope,
  resolveTopicModel,
  type SessionTopicTarget,
} from "./sessions.js";
import { t } from "../../i18n/index.js";
import { logger } from "../../utils/logger.js";

/** How many recent sessions to consider per run. */
const RESTORE_LIST_LIMIT = 25;
/** Upper bound of topics created per run: forum topic creation is rate-limited. */
const MAX_RESTORE_TOPICS_PER_RUN = 10;
/** Breathing room between creations so a batch does not trip flood control. */
const RESTORE_CREATE_DELAY_MS = 1500;

interface RestorableSession extends SessionTopicTarget {
  updatedAt: number;
  running: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Recreates one topic per open session of the current project. Sessions
 * that already have a bound topic are skipped, never duplicated. Runs from
 * the General topic only, sequentially, so a batch of PC tabs comes back
 * without tripping Telegram flood control.
 */
export async function restoreCommand(ctx: CommandContext<Context>): Promise<void> {
  const scope = getScopeFromContext(ctx);
  const threadOptions = getThreadSendOptions(scope?.threadId ?? null);

  if (!ctx.chat || ctx.chat.type === "private" || !isGeneralForumScope(ctx)) {
    await ctx.reply(t("restore.requires_forum_general"), threadOptions);
    return;
  }

  const scopeKey = scope?.key ?? GLOBAL_SCOPE_KEY;
  const currentProject = getCurrentProject(scopeKey);
  if (!currentProject) {
    await ctx.reply(t("sessions.project_not_selected"), threadOptions);
    return;
  }

  if (!(await projectDirectoryExists(currentProject.worktree))) {
    await ctx.reply(t("projects.worktree_missing"), threadOptions);
    return;
  }

  let sessions: Array<{
    id: string;
    title: string;
    model?: SessionTopicTarget["model"];
    agent?: SessionTopicTarget["agent"];
    time?: { updated?: number; created?: number };
  }>;
  let statuses: Record<string, { type?: string }>;
  try {
    const [listResult, statusResult] = await Promise.all([
      opencodeClient.session.list({
        directory: currentProject.worktree,
        limit: RESTORE_LIST_LIMIT,
        roots: true,
      }),
      opencodeClient.session.status({ directory: currentProject.worktree }),
    ]);
    if (listResult.error || !listResult.data) {
      throw listResult.error || new Error("No data received from server");
    }
    sessions = listResult.data;
    statuses =
      statusResult.error || !statusResult.data
        ? {}
        : (statusResult.data as Record<string, { type?: string }>);
  } catch (error) {
    logger.error("[Restore] Failed to load sessions:", error);
    await ctx.reply(t("restore.list_failed"), threadOptions);
    return;
  }

  const unbound: RestorableSession[] = [];
  let skipped = 0;
  for (const session of sessions) {
    if (getTopicBindingBySessionId(session.id)) {
      skipped += 1;
      continue;
    }
    unbound.push({
      id: session.id,
      title: session.title,
      model: session.model,
      agent: session.agent,
      updatedAt: session.time?.updated ?? session.time?.created ?? 0,
      running: statuses[session.id]?.type === "busy",
    });
  }

  if (unbound.length === 0) {
    await ctx.reply(t("restore.empty"), threadOptions);
    return;
  }

  // Running sessions first, then newest: the active PC tabs come back first.
  unbound.sort((a, b) => {
    if (a.running !== b.running) {
      return a.running ? -1 : 1;
    }
    return b.updatedAt - a.updatedAt;
  });

  const batch = unbound.slice(0, MAX_RESTORE_TOPICS_PER_RUN);
  const remaining = unbound.length - batch.length;
  await ctx.reply(t("restore.progress", { total: batch.length }), threadOptions);

  const created: Array<{ title: string; url: string | null }> = [];
  let failed = 0;
  const chatId = ctx.chat.id;

  for (let index = 0; index < batch.length; index++) {
    const session = batch[index]!;
    try {
      const createdTopic = await ctx.api.createForumTopic(
        chatId,
        formatTopicTitle(
          formatSessionDisplayTitle(session.title),
          formatSessionDisplayTitle(session.title),
        ),
        { icon_color: TOPIC_COLORS.BLUE },
      );
      const topicThreadId = createdTopic.message_thread_id;
      const topicScopeKey = createScopeKeyFromParams({
        chatId,
        threadId: topicThreadId,
        context: SCOPE_CONTEXT.GROUP_TOPIC,
      });

      const sessionInfo: SessionInfo = {
        id: session.id,
        title: session.title,
        directory: currentProject.worktree,
      };
      setCurrentProject(currentProject, topicScopeKey);
      setCurrentSession(sessionInfo, topicScopeKey);
      const sessionAgent =
        session.agent && session.agent.trim().length > 0
          ? session.agent
          : await resolveProjectAgent(getStoredAgent(scopeKey), scopeKey);
      setCurrentAgent(sessionAgent, topicScopeKey);
      setCurrentModel(resolveTopicModel(session, scopeKey), topicScopeKey);

      registerTopicSessionBinding({
        scopeKey: topicScopeKey,
        chatId,
        threadId: topicThreadId,
        sessionId: session.id,
        projectId: currentProject.id,
        projectWorktree: currentProject.worktree,
        topicName: formatTopicTitle(session.title, session.title),
        status: TOPIC_SESSION_STATUS.ACTIVE,
      });

      summaryAggregator.setSession(session.id);
      if (!pinnedMessageManager.isInitialized(topicScopeKey)) {
        pinnedMessageManager.initialize(ctx.api, chatId, topicScopeKey, topicThreadId);
      }
      keyboardManager.initialize(ctx.api, chatId, topicScopeKey);
      try {
        await pinnedMessageManager.onSessionChange(session.id, session.title, topicScopeKey);
        await pinnedMessageManager.loadContextFromHistory(
          session.id,
          currentProject.worktree,
          topicScopeKey,
        );
      } catch (error) {
        logger.warn("[Restore] Error preparing topic pinned message", {
          sessionId: session.id,
          error,
        });
      }

      const topicModel = getStoredModel(topicScopeKey);
      const topicAgent = await resolveProjectAgent(getStoredAgent(topicScopeKey), topicScopeKey);
      const topicKeyboard = createMainKeyboard(
        topicAgent,
        topicModel,
        pinnedMessageManager.getContextInfo(topicScopeKey) ??
          keyboardManager.getContextInfo(topicScopeKey) ??
          undefined,
        formatVariantForButton(topicModel.variant || "default"),
      );
      const topicMessage = await ctx.api.sendMessage(
        chatId,
        t(BOT_I18N_KEY.NEW_TOPIC_CREATED, { title: session.title }),
        { ...getThreadSendOptions(topicThreadId), reply_markup: topicKeyboard },
      );
      created.push({
        title: session.title,
        url: buildTopicMessageLink(ctx.chat, topicMessage.message_id),
      });
      logger.info(`[Restore] Created topic for session: id=${session.id}`, {
        threadId: topicThreadId,
      });
    } catch (error) {
      failed += 1;
      logger.error("[Restore] Failed to restore session topic:", {
        sessionId: session.id,
        error,
      });
      const description =
        error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      if (description.includes("not enough rights")) {
        await ctx.reply(t(BOT_I18N_KEY.NEW_TOPIC_CREATE_NO_RIGHTS), threadOptions);
        break;
      }
    }

    if (index < batch.length - 1) {
      await sleep(RESTORE_CREATE_DELAY_MS);
    }
  }

  const lines = created.map((entry) =>
    entry.url ? `• ${entry.title}\n  ${entry.url}` : `• ${entry.title}`,
  );
  await ctx.reply(
    [
      t("restore.result", { created: created.length, skipped, failed }),
      ...lines,
      ...(remaining > 0
        ? [t("restore.truncated", { max: MAX_RESTORE_TOPICS_PER_RUN, remaining })]
        : []),
    ].join("\n"),
    threadOptions,
  );
}
