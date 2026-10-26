import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "grammy";

const mocked = vi.hoisted(() => ({
  listMock: vi.fn(),
  clearMock: vi.fn(),
  getSessionMock: vi.fn(),
}));

vi.mock("../../../src/bot/handlers/prompt.js", () => ({
  QUEUED_PROMPT_CANCEL_PREFIX: "queue:cancel:",
  listQueuedPrompts: mocked.listMock,
  clearQueuedPrompts: mocked.clearMock,
}));

vi.mock("../../../src/session/manager.js", () => ({
  getCurrentSession: mocked.getSessionMock,
}));

vi.mock("../../../src/bot/scope.js", () => ({
  getScopeFromContext: () => ({ key: "scope-1", threadId: 9 }),
  getThreadSendOptions: (threadId: number | null) =>
    threadId === null ? {} : { message_thread_id: threadId },
}));

import { QUEUE_CLEAR_ALL_CALLBACK, handleQueueCallback, queueCommand } from "../../../src/bot/commands/queue.js";
import { t } from "../../../src/i18n/index.js";

function createCommandContext(): Context {
  return {
    message: { message_thread_id: 9 },
    reply: vi.fn().mockResolvedValue(undefined),
  } as unknown as Context;
}

function createCallbackContext(data: string): Context {
  return {
    callbackQuery: { data },
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    editMessageText: vi.fn().mockResolvedValue(undefined),
  } as unknown as Context;
}

describe("bot/commands/queue", () => {
  beforeEach(() => {
    mocked.listMock.mockReset().mockReturnValue([]);
    mocked.clearMock.mockReset().mockReturnValue(0);
    mocked.getSessionMock.mockReset().mockReturnValue({
      id: "session-1",
      title: "Session",
      directory: "/repo/app",
    });
  });

  it("reports no session without a current session", async () => {
    mocked.getSessionMock.mockReturnValue(undefined);
    const ctx = createCommandContext();

    await queueCommand(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith(t("queue.no_session"), { message_thread_id: 9 });
  });

  it("reports an empty queue", async () => {
    const ctx = createCommandContext();

    await queueCommand(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith(t("queue.empty"), { message_thread_id: 9 });
  });

  it("lists queued prompts with per-item cancel buttons and clear-all", async () => {
    mocked.listMock.mockReturnValue([
      { queueId: "q1", preview: "First" },
      { queueId: "q2", preview: "Second" },
    ]);
    const ctx = createCommandContext();

    await queueCommand(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("#1. First"),
      expect.objectContaining({ reply_markup: expect.anything() }),
    );
    const keyboard = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0][1].reply_markup as {
      inline_keyboard: Array<Array<{ callback_data: string }>>;
    };
    const callbacks = keyboard.inline_keyboard.flat().map((button) => button.callback_data);
    expect(callbacks).toContain("queue:cancel:q1");
    expect(callbacks).toContain("queue:cancel:q2");
    expect(callbacks).toContain(QUEUE_CLEAR_ALL_CALLBACK);
  });

  it("clears the whole queue from the button", async () => {
    mocked.clearMock.mockReturnValue(2);
    const ctx = createCallbackContext(QUEUE_CLEAR_ALL_CALLBACK);

    expect(await handleQueueCallback(ctx)).toBe(true);

    expect(mocked.clearMock).toHaveBeenCalledWith("session-1");
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith({
      text: t("queue.cleared", { count: "2" }),
    });
    expect(ctx.editMessageText).toHaveBeenCalled();
  });

  it("ignores unrelated callbacks", async () => {
    const ctx = createCallbackContext("model:result:0");

    expect(await handleQueueCallback(ctx)).toBe(false);
  });
});
