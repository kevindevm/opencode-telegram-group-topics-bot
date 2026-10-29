import { CommandContext, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { opencodeClient } from "../../opencode/client.js";
import {
  getCurrentProject,
  setCurrentProject,
} from "../../settings/manager.js";
import { setCurrentSession } from "../../session/manager.js";
import { loadRecentSessions, type RecentSessionEntry } from "../../session/recent.js";
import { openSessionInNewTopic } from "./sessions.js";
import { switchToProject } from "../utils/switch-project.js";
import { getProjectFolderName } from "./projects.js";
import {
  ensureActiveInlineMenu,
  replyWithInlineMenu,
} from "../handlers/inline-menu.js";
import { clearAllInteractionState } from "../../interaction/cleanup.js";
import { INTERACTION_CLEAR_REASON } from "../../interaction/constants.js";
import { summaryAggregator } from "../../summary/aggregator.js";
import { logger } from "../../utils/logger.js";
import { config } from "../../config.js";
import { t } from "../../i18n/index.js";
import {
  GLOBAL_SCOPE_KEY,
  getScopeFromContext,
  getScopeKeyFromContext,
  getThreadSendOptions,
  isTopicScope,
} from "../scope.js";
import { CHAT_TYPE } from "../constants.js";

export const RECENT_CALLBACK_PREFIX = "recent:";
const RECENT_PAGE_CALLBACK_PREFIX = "recent:page:";
/** How many pages deep a tap can resolve a session from. */
const RECENT_SELECT_SCAN_PAGES = 5;

const STATUS_DOT: Record<RecentSessionEntry["status"], string> = {
  running: "🔴",
  idle: "⚪",
};

function buildRecentKeyboard(
  entries: RecentSessionEntry[],
  page: number,
  pageSize: number,
  hasNext: boolean,
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const pageStartIndex = page * pageSize;
  entries.forEach((entry, index) => {
    const folder = getProjectFolderName(entry.directory);
    const title = entry.title?.trim() ? entry.title : folder;
    keyboard
      .text(
        `${pageStartIndex + index + 1}. ${title} · ${folder} ${STATUS_DOT[entry.status]}`,
        `${RECENT_CALLBACK_PREFIX}${entry.id}`,
      )
      .row();
  });
  if (page > 0) {
    keyboard.text(t("sessions.button.prev_page"), `${RECENT_PAGE_CALLBACK_PREFIX}${page - 1}`);
  }
  if (hasNext) {
    keyboard.text(t("sessions.button.next_page"), `${RECENT_PAGE_CALLBACK_PREFIX}${page + 1}`);
  }
  if (page > 0 || hasNext) {
    keyboard.row();
  }
  return keyboard;
}

function parseRecentPageCallback(data: string): number | null {
  if (!data.startsWith(RECENT_PAGE_CALLBACK_PREFIX)) {
    return null;
  }
  const rawPage = data.slice(RECENT_PAGE_CALLBACK_PREFIX.length);
  const page = Number(rawPage);
  return Number.isInteger(page) && page >= 0 ? page : null;
}

function parseRecentIdCallback(data: string): string | null {
  if (!data.startsWith(RECENT_CALLBACK_PREFIX)) {
    return null;
  }
  const sessionId = data.slice(RECENT_CALLBACK_PREFIX.length);
  return sessionId.length > 0 ? sessionId : null;
}

async function loadRecentPage(
  page: number,
  pageSize: number,
): Promise<{ entries: RecentSessionEntry[]; hasNext: boolean; page: number }> {
  const endExclusive = (page + 1) * pageSize;
  const entries = await loadRecentSessions(endExclusive + 1);
  return {
    entries: entries.slice(page * pageSize, endExclusive),
    hasNext: entries.length > endExclusive,
    page,
  };
}

export async function recentCommand(ctx: CommandContext<Context>): Promise<void> {
  try {
    const scope = getScopeFromContext(ctx);
    if (isTopicScope(scope)) {
      await ctx.reply(
        t("recent.topic_locked"),
        getThreadSendOptions(scope?.threadId ?? null),
      );
      return;
    }

    const pageSize = config.bot.sessionsListLimit;
    const pageData = await loadRecentPage(0, pageSize);

    if (pageData.entries.length === 0) {
      await ctx.reply(t("recent.empty"), getThreadSendOptions(scope?.threadId ?? null));
      return;
    }

    await replyWithInlineMenu(ctx, {
      menuKind: "recent",
      text: t("recent.heading"),
      keyboard: buildRecentKeyboard(pageData.entries, pageData.page, pageSize, pageData.hasNext),
    });
  } catch (error) {
    logger.error("[Recent] Error fetching recent sessions:", error);
    await ctx.reply(t("sessions.fetch_error"));
  }
}

export async function handleRecentSelect(ctx: Context): Promise<boolean> {
  const scopeKey = getScopeKeyFromContext(ctx);
  const scope = getScopeFromContext(ctx);
  const callbackQuery = ctx.callbackQuery;
  if (!callbackQuery?.data) {
    return false;
  }

  const isActiveMenu = await ensureActiveInlineMenu(ctx, "recent");
  if (!isActiveMenu) {
    return true;
  }

  const page = parseRecentPageCallback(callbackQuery.data);
  if (page !== null) {
    try {
      const pageSize = config.bot.sessionsListLimit;
      const pageData = await loadRecentPage(page, pageSize);
      if (pageData.entries.length === 0) {
        await ctx.answerCallbackQuery({ text: t("sessions.page_empty_callback") });
        return true;
      }
      await ctx.editMessageText(t("recent.heading"), {
        reply_markup: buildRecentKeyboard(
          pageData.entries,
          pageData.page,
          pageSize,
          pageData.hasNext,
        ),
      });
      await ctx.answerCallbackQuery();
    } catch (error) {
      logger.error("[Recent] Error loading recent sessions page:", error);
      await ctx.answerCallbackQuery({ text: t("sessions.page_load_error_callback") });
    }
    return true;
  }

  const sessionId = parseRecentIdCallback(callbackQuery.data);
  if (sessionId === null) {
    return false;
  }

  try {
    // Selections can arrive from any page, so scan deeper than one page.
    const entries = await loadRecentSessions(config.bot.sessionsListLimit * RECENT_SELECT_SCAN_PAGES);
    const entry = entries.find((candidate) => candidate.id === sessionId);

    if (!entry) {
      await ctx.answerCallbackQuery({ text: t("callback.processing_error") }).catch(() => {});
      return true;
    }

    // Acknowledge the tap before any slow I/O so re-taps don't pile up;
    // failures below are reported as messages since the toast is spent.
    await ctx.answerCallbackQuery().catch(() => {});

    const { data: session, error } = await opencodeClient.session.get({
      sessionID: entry.id,
      directory: entry.directory,
    });

    if (error || !session) {
      throw error || new Error("Failed to get session details");
    }

    const isPrivateChat = ctx.chat?.type === CHAT_TYPE.PRIVATE;
    if (isPrivateChat || !ctx.chat) {
      setCurrentProject(entry.project, scopeKey);
      setCurrentSession(
        { id: session.id, title: session.title, directory: entry.directory },
        scopeKey,
      );
      summaryAggregator.setSession(session.id);
      if (scopeKey === GLOBAL_SCOPE_KEY) {
        clearAllInteractionState(INTERACTION_CLEAR_REASON.SESSION_SWITCHED);
      } else {
        clearAllInteractionState(INTERACTION_CLEAR_REASON.SESSION_SWITCHED, scopeKey);
      }

      await ctx.reply(
        t("recent.selected", {
          title: session.title,
          project: getProjectFolderName(entry.directory),
        }),
        getThreadSendOptions(scope?.threadId ?? null),
      );
      return true;
    }

    let project = getCurrentProject(scopeKey);
    if (!project) {
      await switchToProject(ctx, entry.project, INTERACTION_CLEAR_REASON.PROJECT_SWITCHED);
      project = entry.project;
    }

    if (project.worktree !== entry.directory) {
      await switchToProject(ctx, entry.project, INTERACTION_CLEAR_REASON.PROJECT_SWITCHED);
      project = entry.project;
    }

    if (await openSessionInNewTopic(ctx, session, project, scopeKey, scope)) {
      return true;
    }

    setCurrentProject(project, scopeKey);
    setCurrentSession(
      { id: session.id, title: session.title, directory: entry.directory },
      scopeKey,
    );
    summaryAggregator.setSession(session.id);

    await ctx.reply(
      t("recent.selected", {
        title: session.title,
        project: getProjectFolderName(entry.directory),
      }),
      getThreadSendOptions(scope?.threadId ?? null),
    );
    return true;
  } catch (selectError) {
    logger.error("[Recent] Error selecting recent session:", selectError);
    await ctx
      .answerCallbackQuery({ text: t("callback.processing_error") })
      .catch(() => {});
    return true;
  }
}

export const __recentTestHooks = {
  buildRecentKeyboard,
  parseRecentIdCallback,
  parseRecentPageCallback,
};
