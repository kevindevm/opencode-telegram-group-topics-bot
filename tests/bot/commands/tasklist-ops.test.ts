import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "grammy";
import {
  handleTaskListCallback,
  taskListCommand,
} from "../../../src/bot/commands/tasklist.js";
import { interactionManager } from "../../../src/interaction/manager.js";

const mocked = vi.hoisted(() => ({
  getCurrentProjectMock: vi.fn(),
  listScheduledTasksMock: vi.fn(),
  updateScheduledTaskMock: vi.fn(),
}));

vi.mock("../../../src/settings/manager.js", () => ({
  getCurrentProject: mocked.getCurrentProjectMock,
}));

vi.mock("../../../src/scheduled-task/store.js", () => ({
  listScheduledTasks: mocked.listScheduledTasksMock,
  removeScheduledTask: vi.fn(),
  updateScheduledTask: mocked.updateScheduledTaskMock,
}));

function task(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    kind: "cron",
    projectId: "project-1",
    projectWorktree: "/repo/app",
    createdFromScopeKey: "-100123:77",
    agent: "review",
    model: { providerID: "openai", modelID: "gpt-5", variant: null },
    delivery: { chatId: -100123, threadId: 555 },
    scheduleText: "daily",
    scheduleSummary: "daily 09:00",
    timezone: "UTC",
    prompt: "Review PRs",
    createdAt: "2026-03-25T00:00:00.000Z",
    nextRunAt: "2026-03-26T09:00:00.000Z",
    lastRunAt: null,
    runCount: 0,
    lastStatus: "idle",
    lastError: null,
    lastResult: null,
    cron: "0 9 * * *",
    ...overrides,
  };
}

function createCommandContext(): Context {
  return {
    chat: { id: -100123, type: "supergroup" },
    message: { text: "/tasklist", message_thread_id: 77, is_topic_message: true },
    reply: vi.fn().mockResolvedValue({ message_id: 456 }),
  } as unknown as Context;
}

function createCallbackContext(data: string): Context {
  return {
    chat: { id: -100123, type: "supergroup" },
    callbackQuery: {
      data,
      message: { message_id: 456, message_thread_id: 77 },
    } as Context["callbackQuery"],
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    editMessageText: vi.fn().mockResolvedValue(undefined),
  } as unknown as Context;
}

describe("bot/commands/tasklist ops", () => {
  beforeEach(() => {
    interactionManager.clear("test_setup", "-100123:77");
    mocked.getCurrentProjectMock.mockReset().mockReturnValue({ id: "project-1", worktree: "/repo/app" });
    mocked.listScheduledTasksMock.mockReset().mockReturnValue([task("task-a")]);
    mocked.updateScheduledTaskMock.mockReset();
  });

  it("pauses and resumes a task", async () => {
    mocked.updateScheduledTaskMock.mockResolvedValue(task("task-a", { paused: true }));
    await taskListCommand(createCommandContext() as never);

    const handled = await handleTaskListCallback(createCallbackContext("tasklist:pause:task-a"));

    expect(handled).toBe(true);
    expect(mocked.updateScheduledTaskMock).toHaveBeenCalledWith(
      "task-a",
      expect.any(Function),
    );
  });

  it("queues an immediate run", async () => {
    mocked.updateScheduledTaskMock.mockResolvedValue(task("task-a"));
    await taskListCommand(createCommandContext() as never);

    const handled = await handleTaskListCallback(createCallbackContext("tasklist:run:task-a"));

    expect(handled).toBe(true);
    expect(mocked.updateScheduledTaskMock).toHaveBeenCalledWith(
      "task-a",
      expect.any(Function),
    );
  });

  it("shows the last run log", async () => {
    mocked.listScheduledTasksMock.mockReturnValue([
      task("task-a", { lastResult: "All checks passed", lastStatus: "success" }),
    ]);
    await taskListCommand(createCommandContext() as never);

    const ctx = createCallbackContext("tasklist:log:task-a");
    const handled = await handleTaskListCallback(ctx);

    expect(handled).toBe(true);
    expect(ctx.editMessageText).toHaveBeenCalledWith(
      expect.stringContaining("All checks passed"),
      expect.anything(),
    );
  });

  it("returns to the list from the log view", async () => {
    await taskListCommand(createCommandContext() as never);

    const ctx = createCallbackContext("tasklist:back");
    const handled = await handleTaskListCallback(ctx);

    expect(handled).toBe(true);
    expect(ctx.editMessageText).toHaveBeenCalledWith(
      expect.stringContaining("Review PRs"),
      expect.anything(),
    );
  });
});
