import { CommandContext, Context, InlineKeyboard } from "grammy";
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
  type ProjectInfo,
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
  getScopeKeyFromContext,
  getThreadSendOptions,
} from "../scope.js";
import { BOT_I18N_KEY } from "../constants.js";
import { getTopicBindingBySessionId, registerTopicSessionBinding } from "../../topic/manager.js";
import { TOPIC_COLORS } from "../../topic/colors.js";
import { formatTopicTitle } from "../../topic/title-format.js";
import { buildTopicMessageLink } from "../utils/topic-link.js";
import {
  appendInlineMenuCancelButton,
  clearActiveInlineMenu,
  ensureActiveInlineMenu,
  replyWithInlineMenu,
} from "../handlers/inline-menu.js";
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
/** Sessions touched within this window come pre-selected; older ones are shown unselected. */
const RESTORE_RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Breathing room between creations so a batch does not trip flood control. */
const RESTORE_CREATE_DELAY_MS = 1500;
/** Selection menus never outlive this. */
const RESTORE_MENU_TTL_MS = 5 * 60 * 1000;

const RESTORE_TOGGLE_PREFIX = "restore:toggle:";
const RESTORE_CONFIRM_CALLBACK = "restore:confirm";

interface RestorableSession extends SessionTopicTarget {
  updatedAt: number;
  running: boolean;
}

interface PendingRestoreMenu {
  chatId: number;
  threadId: number | null;
  scopeKey: string;
  project: ProjectInfo;
  candidates: RestorableSession[];
  selected: Set<string>;
  skipped: number;
  expiresAt: number;
}

const pendingRestoreMenus = new Map<string, PendingRestoreMenu>();

function menuKey(scopeKey: string, messageId: number): string {
  return `${scopeKey}:${messageId}`;
}

function rememberMenu(scopeKey: string, messageId: number, menu: PendingRestoreMenu): void {
  if (pendingRestoreMenus.size >= 20) {
    const oldest = pendingRestoreMenus.keys().next();
    if (!oldest.done) {
      pendingRestoreMenus.delete(oldest.value);
    }
  }
  pendingRestoreMenus.set(menuKey(scopeKey, messageId), menu);
  setTimeout(() => {
    pendingRestoreMenus.delete(menuKey(scopeKey, messageId));
  }, RESTORE_MENU_TTL_MS).unref?.();
}

function takeMenu(scopeKey: string, messageId: number): PendingRestoreMenu | null {
  const key = menuKey(scopeKey, messageId);
  const menu = pendingRestoreMenus.get(key) ?? null;
  if (menu && menu.expiresAt > Date.now()) {
    return menu;
  }
  pendingRestoreMenus.delete(key);
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildRestoreKeyboard(menu: PendingRestoreMenu): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  menu.candidates.forEach((session, index) => {
    const mark = menu.selected.has(session.id) ? "✅" : "⬜";
    const activity = session.running ? "●" : "○";
    keyboard
      .text(
        `${mark} ${index + 1}. ${session.title} ${activity}`,
        `${RESTORE_TOGGLE_PREFIX}${session.id}`,
      )
      .row();
  });
  keyboard
    .text(t("restore.confirm_button", { count: menu.selected.size }), RESTORE_CONFIRM_CALLBACK)
    .row();
  return keyboard;
}

function formatRestoreMenuText(menu: PendingRestoreMenu): string {
  return t("restore.menu_title", { skipped: menu.skipped });
}

/**
 * Shows every unbound recent session of the current project and lets the
 * user pick which ones become topics. Sessions the server reports as
 * running — plus anything touched in the last 24h — come pre-selected;
 * older ones are listed unselected so nothing ancient is restored by
 * accident. The opposite of /cleanup: only real session tabs, never
 * subagent transcripts (those are child sessions and never listed).
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

  const candidates: RestorableSession[] = [];
  let skipped = 0;
  for (const session of sessions) {
    if (getTopicBindingBySessionId(session.id)) {
      skipped += 1;
      continue;
    }
    candidates.push({
      id: session.id,
      title: session.title,
      model: session.model,
      agent: session.agent,
      updatedAt: session.time?.updated ?? session.time?.created ?? 0,
      running: statuses[session.id]?.type === "busy",
    });
  }

  if (candidates.length === 0) {
    await ctx.reply(t("restore.empty"), threadOptions);
    return;
  }

  // Running sessions first, then newest: the active tabs surface on top.
  candidates.sort((a, b) => {
    if (a.running !== b.running) {
      return a.running ? -1 : 1;
    }
    return b.updatedAt - a.updatedAt;
  });

  const freshBefore = Date.now() - RESTORE_RECENT_WINDOW_MS;
  const menu: PendingRestoreMenu = {
    chatId: ctx.chat.id,
    threadId: scope?.threadId ?? null,
    scopeKey,
    project: currentProject,
    candidates,
    selected: new Set(
      candidates
        .filter((session) => session.running || session.updatedAt >= freshBefore)
        .slice(0, MAX_RESTORE_TOPICS_PER_RUN)
        .map((session) => session.id),
    ),
    skipped,
    expiresAt: Date.now() + RESTORE_MENU_TTL_MS,
  };

  const messageId = await replyWithInlineMenu(ctx, {
    menuKind: "restore",
    text: formatRestoreMenuText(menu),
    keyboard: buildRestoreKeyboard(menu),
  });
  rememberMenu(scopeKey, messageId, menu);
}

export async function handleRestoreCallback(ctx: Context): Promise<boolean> {
  const data = ctx.callbackQuery?.data;
  if (!data) {
    return false;
  }

  const isToggle = data.startsWith(RESTORE_TOGGLE_PREFIX);
  if (!isToggle && data !== RESTORE_CONFIRM_CALLBACK) {
    return false;
  }

  const isActive = await ensureActiveInlineMenu(ctx, "restore");
  if (!isActive) {
    return true;
  }

  const scopeKey = getScopeKeyFromContext(ctx);
  const message = ctx.callbackQuery?.message;
  const messageId =
    message && "message_id" in message && typeof message.message_id === "number"
      ? message.message_id
      : null;
  if (messageId === null) {
    return true;
  }

  const menu = takeMenu(scopeKey, messageId);
  if (!menu) {
    await ctx.answerCallbackQuery({ text: t("inline.inactive_callback"), show_alert: true });
    return true;
  }

  if (isToggle) {
    const sessionId = data.slice(RESTORE_TOGGLE_PREFIX.length);
    if (menu.selected.has(sessionId)) {
      menu.selected.delete(sessionId);
    } else if (menu.candidates.some((session) => session.id === sessionId)) {
      menu.selected.add(sessionId);
    }
    rememberMenu(scopeKey, messageId, menu);
    try {
      await ctx.editMessageText(formatRestoreMenuText(menu), {
        reply_markup: appendInlineMenuCancelButton(buildRestoreKeyboard(menu), "restore"),
      });
    } catch (error) {
      logger.debug("[Restore] Failed to refresh selection menu", error);
    }
    await ctx.answerCallbackQuery().catch(() => {});
    return true;
  }

  // Confirm: lock the menu and create one topic per selected session.
  pendingRestoreMenus.delete(menuKey(scopeKey, messageId));
  clearActiveInlineMenu("restore_confirmed", scopeKey);
  await ctx.answerCallbackQuery().catch(() => {});
  await ctx.deleteMessage().catch(() => {});

  const selected = menu.candidates.filter((session) => menu.selected.has(session.id));
  if (selected.length === 0) {
    await ctx.api
      .sendMessage(
        menu.chatId,
        t("restore.no_selection"),
        getThreadSendOptions(menu.threadId),
      )
      .catch(() => {});
    return true;
  }

  const batch = selected.slice(0, MAX_RESTORE_TOPICS_PER_RUN);
  const remaining = selected.length - batch.length;
  const progressMessage = await ctx.api
    .sendMessage(
      menu.chatId,
      t("restore.progress", { total: batch.length }),
      getThreadSendOptions(menu.threadId),
    )
    .catch(() => null);

  const created: Array<{ title: string; url: string | null }> = [];
  let failed = 0;

  for (let index = 0; index < batch.length; index++) {
    const session = batch[index]!;
    try {
      const createdTopic = await ctx.api.createForumTopic(
        menu.chatId,
        formatTopicTitle(
          formatSessionDisplayTitle(session.title),
          formatSessionDisplayTitle(session.title),
        ),
        { icon_color: TOPIC_COLORS.BLUE },
      );
      const topicThreadId = createdTopic.message_thread_id;
      const topicScopeKey = createScopeKeyFromParams({
        chatId: menu.chatId,
        threadId: topicThreadId,
        context: SCOPE_CONTEXT.GROUP_TOPIC,
      });

      const sessionInfo: SessionInfo = {
        id: session.id,
        title: session.title,
        directory: menu.project.worktree,
      };
      setCurrentProject(menu.project, topicScopeKey);
      setCurrentSession(sessionInfo, topicScopeKey);
      const sessionAgent =
        session.agent && session.agent.trim().length > 0
          ? session.agent
          : await resolveProjectAgent(getStoredAgent(menu.scopeKey), menu.scopeKey);
      setCurrentAgent(sessionAgent, topicScopeKey);
      setCurrentModel(resolveTopicModel(session, menu.scopeKey), topicScopeKey);

      registerTopicSessionBinding({
        scopeKey: topicScopeKey,
        chatId: menu.chatId,
        threadId: topicThreadId,
        sessionId: session.id,
        projectId: menu.project.id,
        projectWorktree: menu.project.worktree,
        topicName: formatTopicTitle(session.title, session.title),
        status: TOPIC_SESSION_STATUS.ACTIVE,
      });

      summaryAggregator.setSession(session.id);
      if (!pinnedMessageManager.isInitialized(topicScopeKey)) {
        pinnedMessageManager.initialize(ctx.api, menu.chatId, topicScopeKey, topicThreadId);
      }
      keyboardManager.initialize(ctx.api, menu.chatId, topicScopeKey);
      try {
        await pinnedMessageManager.onSessionChange(session.id, session.title, topicScopeKey);
        await pinnedMessageManager.loadContextFromHistory(
          session.id,
          menu.project.worktree,
          topicScopeKey,
        );
      } catch (error) {
        logger.warn("[Restore] Error preparing topic pinned message", {
          sessionId: session.id,
          error,
        });
      }

      const topicModel = getStoredModel(topicScopeKey);
      const topicAgent = await resolveProjectAgent(
        getStoredAgent(topicScopeKey),
        topicScopeKey,
      );
      const topicKeyboard = createMainKeyboard(
        topicAgent,
        topicModel,
        pinnedMessageManager.getContextInfo(topicScopeKey) ??
          keyboardManager.getContextInfo(topicScopeKey) ??
          undefined,
        formatVariantForButton(topicModel.variant || "default"),
      );
      const topicMessage = await ctx.api.sendMessage(
        menu.chatId,
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
        await ctx.api
          .sendMessage(
            menu.chatId,
            t(BOT_I18N_KEY.NEW_TOPIC_CREATE_NO_RIGHTS),
            getThreadSendOptions(menu.threadId),
          )
          .catch(() => {});
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
  const resultText = [
    t("restore.result", { created: created.length, skipped: menu.skipped, failed }),
    ...lines,
    ...(remaining > 0
      ? [t("restore.truncated", { max: MAX_RESTORE_TOPICS_PER_RUN, remaining })]
      : []),
  ].join("\n");

  if (progressMessage) {
    await ctx.api
      .editMessageText(menu.chatId, progressMessage.message_id, resultText)
      .catch(() => {});
  } else {
    await ctx.api
      .sendMessage(menu.chatId, resultText, getThreadSendOptions(menu.threadId))
      .catch(() => {});
  }
  return true;
}
