import type { CommandContext, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { t } from "../../i18n/index.js";
import { getCurrentProject } from "../../settings/manager.js";
import {
  appendInlineMenuCancelButton,
  clearActiveInlineMenu,
  ensureActiveInlineMenu,
  replyWithInlineMenu,
} from "../handlers/inline-menu.js";
import { getScopeKeyFromContext } from "../scope.js";
import { logger } from "../../utils/logger.js";
import { formatTaskListBadge } from "../../scheduled-task/display.js";
import { listScheduledTasks, removeScheduledTask, updateScheduledTask } from "../../scheduled-task/store.js";
import type { ScheduledTask } from "../../scheduled-task/types.js";

const TASKLIST_DELETE_CALLBACK_PREFIX = "tasklist:delete:";
const TASKLIST_PAUSE_CALLBACK_PREFIX = "tasklist:pause:";
const TASKLIST_RUN_CALLBACK_PREFIX = "tasklist:run:";
const TASKLIST_LOG_CALLBACK_PREFIX = "tasklist:log:";
const TASKLIST_BACK_CALLBACK = "tasklist:back";
const MAX_PROMPT_PREVIEW_LENGTH = 160;
const MAX_LOG_PREVIEW_LENGTH = 3000;

function getScopedScheduledTasks(ctx: Context): ScheduledTask[] {
  const scopeKey = getScopeKeyFromContext(ctx);
  const currentProject = getCurrentProject(scopeKey);
  if (!currentProject || !ctx.chat) {
    return [];
  }

  return listScheduledTasks()
    .filter((task) => task.projectId === currentProject.id && task.delivery.chatId === ctx.chat!.id)
    .sort((left, right) => {
      const leftTimestamp = left.nextRunAt ? Date.parse(left.nextRunAt) : Number.MAX_SAFE_INTEGER;
      const rightTimestamp = right.nextRunAt
        ? Date.parse(right.nextRunAt)
        : Number.MAX_SAFE_INTEGER;
      return leftTimestamp - rightTimestamp;
    });
}

function formatTaskStatus(task: ScheduledTask): string {
  const pausedPrefix = task.paused ? `${t("task.list.paused")} · ` : "";
  if (task.lastStatus === "error" && task.lastError) {
    return `${pausedPrefix}${task.lastStatus}: ${task.lastError}`;
  }

  return `${pausedPrefix}${task.lastStatus}`;
}

function formatTaskPromptPreview(prompt: string): string {
  const singleLinePrompt = prompt.replace(/\s+/g, " ").trim();
  if (singleLinePrompt.length <= MAX_PROMPT_PREVIEW_LENGTH) {
    return singleLinePrompt;
  }

  return `${singleLinePrompt.slice(0, MAX_PROMPT_PREVIEW_LENGTH - 3).trimEnd()}...`;
}

function buildTaskListText(tasks: ScheduledTask[]): string {
  const lines = tasks.map((task, index) => {
    const nextRunAt = task.nextRunAt ?? t("task.list.none");
    return [
      `${index + 1}. ${formatTaskListBadge(task)} - ${task.scheduleSummary}`,
      `   ${t("task.list.next_run", { value: nextRunAt })}`,
      `   ${t("task.list.status", { value: formatTaskStatus(task) })}`,
      `   ${t("task.list.prompt", { value: formatTaskPromptPreview(task.prompt) })}`,
    ].join("\n");
  });

  return `${t("task.list.title")}\n\n${lines.join("\n\n")}`;
}

function buildTaskListKeyboard(tasks: ScheduledTask[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  tasks.forEach((task, index) => {
    const label = `${index + 1}`;
    keyboard
      .text(
        task.paused
          ? t("task.list.resume_button", { index: label })
          : t("task.list.pause_button", { index: label }),
        `${TASKLIST_PAUSE_CALLBACK_PREFIX}${task.id}`,
      )
      .text(
        t("task.list.run_button", { index: label }),
        `${TASKLIST_RUN_CALLBACK_PREFIX}${task.id}`,
      )
      .text(
        t("task.list.log_button", { index: label }),
        `${TASKLIST_LOG_CALLBACK_PREFIX}${task.id}`,
      )
      .text(
        t("task.list.delete_button", { index: label }),
        `${TASKLIST_DELETE_CALLBACK_PREFIX}${task.id}`,
      )
      .row();
  });

  return keyboard;
}

function truncateLog(text: string): string {
  if (text.length <= MAX_LOG_PREVIEW_LENGTH) {
    return text;
  }

  return `${text.slice(0, MAX_LOG_PREVIEW_LENGTH - 3).trimEnd()}...`;
}

function formatTaskLog(task: ScheduledTask): string {
  const header = t("task.list.log_title", {
    summary: task.scheduleSummary,
    status: formatTaskStatus(task),
    runAt: task.lastRunAt ?? t("task.list.none"),
  });
  const body = task.lastResult ?? task.lastError ?? t("task.list.log_empty");
  return `${header}\n\n${truncateLog(body)}`;
}

async function refreshTaskListMessage(ctx: Context): Promise<void> {
  const remainingTasks = getScopedScheduledTasks(ctx);
  if (remainingTasks.length === 0) {
    clearActiveInlineMenu("tasklist_empty_after_delete", getScopeKeyFromContext(ctx));
    await ctx.editMessageText(t("task.list.empty"));
    return;
  }

  await ctx.editMessageText(buildTaskListText(remainingTasks), {
    reply_markup: appendInlineMenuCancelButton(buildTaskListKeyboard(remainingTasks), "tasklist"),
  });
}

export async function taskListCommand(ctx: CommandContext<Context>): Promise<void> {
  const tasks = getScopedScheduledTasks(ctx);

  if (tasks.length === 0) {
    await ctx.reply(t("task.list.empty"));
    return;
  }

  await replyWithInlineMenu(ctx, {
    menuKind: "tasklist",
    text: buildTaskListText(tasks),
    keyboard: buildTaskListKeyboard(tasks),
  });
}

export async function handleTaskListCallback(ctx: Context): Promise<boolean> {
  const data = ctx.callbackQuery?.data;
  if (!data) {
    return false;
  }

  if (data === TASKLIST_BACK_CALLBACK) {
    const isActiveMenu = await ensureActiveInlineMenu(ctx, "tasklist");
    if (!isActiveMenu) {
      return true;
    }

    await ctx.answerCallbackQuery().catch(() => {});
    await refreshTaskListMessage(ctx);
    return true;
  }

  if (
    !data.startsWith(TASKLIST_DELETE_CALLBACK_PREFIX) &&
    !data.startsWith(TASKLIST_PAUSE_CALLBACK_PREFIX) &&
    !data.startsWith(TASKLIST_RUN_CALLBACK_PREFIX) &&
    !data.startsWith(TASKLIST_LOG_CALLBACK_PREFIX)
  ) {
    return false;
  }

  const isActiveMenu = await ensureActiveInlineMenu(ctx, "tasklist");
  if (!isActiveMenu) {
    return true;
  }

  if (data.startsWith(TASKLIST_PAUSE_CALLBACK_PREFIX)) {
    return handleTaskListPause(ctx, data);
  }

  if (data.startsWith(TASKLIST_RUN_CALLBACK_PREFIX)) {
    return handleTaskListRun(ctx, data);
  }

  if (data.startsWith(TASKLIST_LOG_CALLBACK_PREFIX)) {
    return handleTaskListLog(ctx, data);
  }

  const taskId = data.slice(TASKLIST_DELETE_CALLBACK_PREFIX.length);

  try {
    const removed = await removeScheduledTask(taskId);
    await ctx.answerCallbackQuery({
      text: removed ? t("task.list.deleted") : t("task.list.delete_missing"),
    });

    await refreshTaskListMessage(ctx);
  } catch (error) {
    logger.error("[TaskList] Failed to remove scheduled task", error);
    await ctx.answerCallbackQuery({ text: t("task.list.delete_error"), show_alert: true });
  }

  return true;
}

async function handleTaskListPause(ctx: Context, data: string): Promise<boolean> {
  const taskId = data.slice(TASKLIST_PAUSE_CALLBACK_PREFIX.length);
  const updated = await updateScheduledTask(taskId, (task) => ({
    ...task,
    paused: !task.paused,
  }));

  if (!updated) {
    await ctx.answerCallbackQuery({ text: t("task.list.delete_missing") });
    return true;
  }

  await ctx.answerCallbackQuery({
    text: updated.paused ? t("task.list.paused_message") : t("task.list.resumed_message"),
  });
  await refreshTaskListMessage(ctx);
  return true;
}

async function handleTaskListRun(ctx: Context, data: string): Promise<boolean> {
  const taskId = data.slice(TASKLIST_RUN_CALLBACK_PREFIX.length);
  const updated = await updateScheduledTask(taskId, (task) => ({
    ...task,
    nextRunAt: new Date().toISOString(),
  }));

  if (!updated) {
    await ctx.answerCallbackQuery({ text: t("task.list.delete_missing") });
    return true;
  }

  await ctx.answerCallbackQuery({ text: t("task.list.run_scheduled") });
  await refreshTaskListMessage(ctx);
  return true;
}

async function handleTaskListLog(ctx: Context, data: string): Promise<boolean> {
  const taskId = data.slice(TASKLIST_LOG_CALLBACK_PREFIX.length);
  const task = getScopedScheduledTasks(ctx).find((candidate) => candidate.id === taskId);

  if (!task) {
    await ctx.answerCallbackQuery({ text: t("task.list.delete_missing") });
    return true;
  }

  await ctx.answerCallbackQuery();
  const backKeyboard = new InlineKeyboard().text(t("task.list.back_button"), TASKLIST_BACK_CALLBACK);
  await ctx
    .editMessageText(formatTaskLog(task).slice(0, 4000), {
      reply_markup: appendInlineMenuCancelButton(backKeyboard, "tasklist"),
    })
    .catch(() => {});
  return true;
}
