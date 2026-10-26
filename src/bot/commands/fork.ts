import { CommandContext, Context } from "grammy";
import { opencodeClient, opencodeServerVersion, opencodeV2Client } from "../../opencode/client.js";
import { getCurrentSession, setCurrentSession } from "../../session/manager.js";
import type { SessionInfo } from "../../session/manager.js";
import { getStoredAgent, resolveProjectAgent } from "../../agent/manager.js";
import { getStoredModel } from "../../model/manager.js";
import {
  TOPIC_SESSION_STATUS,
  getCurrentProject,
  setCurrentAgent,
  setCurrentModel,
  setCurrentProject,
} from "../../settings/manager.js";
import { pinnedMessageManager } from "../../pinned/manager.js";
import { keyboardManager } from "../../keyboard/manager.js";
import { summaryAggregator } from "../../summary/aggregator.js";
import { registerTopicSessionBinding } from "../../topic/manager.js";
import { TOPIC_COLORS } from "../../topic/colors.js";
import { formatTopicTitle } from "../../topic/title-format.js";
import { formatSessionDisplayTitle } from "../../session/title-format.js";
import { ingestSessionInfoForCache } from "../../session/cache-manager.js";
import { t } from "../../i18n/index.js";
import { logger } from "../../utils/logger.js";
import { projectDirectoryExists } from "../../project/directory.js";
import {
  SCOPE_CONTEXT,
  createScopeKeyFromParams,
  getScopeFromContext,
  getThreadSendOptions,
  isTopicScope,
} from "../scope.js";
import type { ProcessPromptDeps } from "../handlers/prompt.js";

export function createForkCommand(deps: Pick<ProcessPromptDeps, "ensureEventSubscription">) {
  return async function forkCommand(ctx: CommandContext<Context>): Promise<void> {
    const scope = getScopeFromContext(ctx);
    const scopeKey = scope?.key;
    const threadOptions = getThreadSendOptions(scope?.threadId ?? null);

    if (!scope || !isTopicScope(scope) || !scopeKey || !ctx.chat) {
      await ctx.reply(t("fork.topic_only"), threadOptions);
      return;
    }

    const session = getCurrentSession(scopeKey);
    const currentProject = getCurrentProject(scopeKey);
    if (!session || !currentProject) {
      await ctx.reply(t("fork.no_session"), threadOptions);
      return;
    }

    if (!(await projectDirectoryExists(currentProject.worktree))) {
      await ctx.reply(t("projects.worktree_missing"), threadOptions);
      return;
    }

    await ctx.reply(t("fork.creating"), threadOptions);

    let childId: string;
    let childTitle: string;
    try {
      if (opencodeServerVersion === "v2") {
        const forkSession = opencodeV2Client.session as unknown as {
          fork: (params: {
            sessionID: string;
          }) => Promise<{ data?: { id: string; title: string }; error?: unknown }>;
        };
        const { data, error } = await forkSession.fork({ sessionID: session.id });
        if (error || !data) {
          throw error ?? new Error("fork failed");
        }
        childId = data.id;
        childTitle = data.title;
      } else {
        const { data, error } = await opencodeClient.session.create({
          directory: currentProject.worktree,
        });
        if (error || !data) {
          throw error ?? new Error("create failed");
        }
        childId = data.id;
        childTitle = data.title;
      }
    } catch (error) {
      logger.error("[Fork] Failed to fork session:", error);
      await ctx.reply(t("fork.error"), threadOptions);
      return;
    }

    const topicTitle = formatTopicTitle(
      `⑂ ${formatSessionDisplayTitle(childTitle)}`,
      formatSessionDisplayTitle(childTitle),
    );

    let createdTopic: { message_thread_id: number } | null = null;
    try {
      createdTopic = await ctx.api.createForumTopic(ctx.chat.id, topicTitle, {
        icon_color: TOPIC_COLORS.GREEN,
      });
    } catch (error) {
      logger.error("[Fork] Failed to create fork topic:", error);
      await ctx.reply(t("fork.topic_error"), threadOptions);
      return;
    }

    const topicThreadId = createdTopic.message_thread_id;
    const topicScopeKey = createScopeKeyFromParams({
      chatId: ctx.chat.id,
      threadId: topicThreadId,
      context: SCOPE_CONTEXT.GROUP_TOPIC,
    });

    const sessionInfo: SessionInfo = {
      id: childId,
      title: childTitle,
      directory: currentProject.worktree,
    };
    setCurrentProject(currentProject, topicScopeKey);
    setCurrentSession(sessionInfo, topicScopeKey);
    setCurrentAgent(
      await resolveProjectAgent(getStoredAgent(scopeKey), scopeKey),
      topicScopeKey,
    );
    const storedModel = getStoredModel(scopeKey);
    setCurrentModel(storedModel, topicScopeKey);

    registerTopicSessionBinding({
      scopeKey: topicScopeKey,
      chatId: ctx.chat.id,
      threadId: topicThreadId,
      sessionId: childId,
      projectId: currentProject.id,
      projectWorktree: currentProject.worktree,
      topicName: topicTitle,
      status: TOPIC_SESSION_STATUS.ACTIVE,
    });

    await deps.ensureEventSubscription(currentProject.worktree);
    summaryAggregator.setSession(childId);
    await ingestSessionInfoForCache({ id: childId, title: childTitle } as never);

    if (!pinnedMessageManager.isInitialized(topicScopeKey)) {
      pinnedMessageManager.initialize(ctx.api, ctx.chat.id, topicScopeKey, topicThreadId);
    }
    keyboardManager.initialize(ctx.api, ctx.chat.id, topicScopeKey);
    try {
      await pinnedMessageManager.onSessionChange(childId, childTitle, topicScopeKey);
    } catch (error) {
      logger.error("[Fork] Error creating pinned message for fork topic:", error);
    }

    await ctx.reply(t("fork.done", { title: childTitle }), threadOptions);
  };
}
