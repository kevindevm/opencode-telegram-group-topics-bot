import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  backgroundMock: vi.fn(),
}));

vi.mock("../../src/opencode/client.js", () => ({
  opencodeClient: {
    session: {
      background: mocked.backgroundMock,
    },
  },
}));

import {
  BACKGROUND_OFFER_PREFIX,
  clearSessionBackgroundOffers,
  handleToolBackgroundCallback,
  noteToolBackgroundState,
  resetBackgroundOfferStateForTests,
} from "../../src/tool/background-offer.js";

function makeApi() {
  return {
    sendMessage: vi.fn().mockResolvedValue({ message_id: 42 }),
    editMessageText: vi.fn().mockResolvedValue(true),
    deleteMessage: vi.fn().mockResolvedValue(true),
  };
}

function noteRunning(api: ReturnType<typeof makeApi>, overrides: Record<string, unknown> = {}) {
  noteToolBackgroundState({
    api,
    sessionId: "ses-1",
    callId: "call-1",
    tool: "bash",
    status: "running",
    commandPreview: "npx tsx -e long-script",
    chatId: -100,
    threadId: 7,
    delayMs: 30_000,
    ...overrides,
  });
}

function noteTerminal(
  api: ReturnType<typeof makeApi>,
  callId: string,
  status: "completed" | "error",
) {
  noteToolBackgroundState({
    api,
    sessionId: "ses-1",
    callId,
    tool: "bash",
    status,
    commandPreview: "npx tsx -e long-script",
    chatId: -100,
    threadId: 7,
    delayMs: 30_000,
  });
}

describe("tool/background-offer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetBackgroundOfferStateForTests();
    mocked.backgroundMock.mockReset();
    mocked.backgroundMock.mockResolvedValue({ data: true, error: undefined });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends the offer only after the tool keeps running past the delay", async () => {
    const api = makeApi();
    noteRunning(api);

    await vi.advanceTimersByTimeAsync(29_999);
    expect(api.sendMessage).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(api.sendMessage).toHaveBeenCalledTimes(1);
    const [, text, options] = api.sendMessage.mock.calls[0] as unknown as [
      number,
      string,
      { reply_markup: { inline_keyboard: Array<Array<{ callback_data: string }>> } },
    ];
    expect(text).toContain("npx tsx -e long-script");
    expect(options.reply_markup.inline_keyboard[0]?.[0]?.callback_data).toBe(
      `${BACKGROUND_OFFER_PREFIX}ses-1`,
    );
  });

  it("sends no offer when the tool finishes before the delay", async () => {
    const api = makeApi();
    noteRunning(api);
    noteTerminal(api, "call-1", "completed");

    await vi.advanceTimersByTimeAsync(120_000);
    expect(api.sendMessage).not.toHaveBeenCalled();
  });

  it("ignores non-shell tools", async () => {
    const api = makeApi();
    for (const tool of ["read", "edit", "write", "task", "glob"]) {
      noteRunning(api, { tool, callId: `call-${tool}` });
    }

    await vi.advanceTimersByTimeAsync(120_000);
    expect(api.sendMessage).not.toHaveBeenCalled();
  });

  it("deletes a live offer when its tool finishes and nothing else runs", async () => {
    const api = makeApi();
    noteRunning(api);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(api.sendMessage).toHaveBeenCalledTimes(1);

    noteTerminal(api, "call-1", "completed");
    expect(api.deleteMessage).toHaveBeenCalledWith(-100, 42);
  });

  it("keeps the offer while a second tool is still running", async () => {
    const api = makeApi();
    noteRunning(api, { callId: "call-a" });
    noteRunning(api, { callId: "call-b" });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(api.sendMessage).toHaveBeenCalledTimes(1);

    noteTerminal(api, "call-b", "completed");
    expect(api.deleteMessage).not.toHaveBeenCalled();

    noteTerminal(api, "call-a", "completed");
    expect(api.deleteMessage).toHaveBeenCalledWith(-100, 42);
  });

  it("sends a single offer for concurrent long tools", async () => {
    const api = makeApi();
    noteRunning(api, { callId: "call-a" });
    noteRunning(api, { callId: "call-b" });

    await vi.advanceTimersByTimeAsync(120_000);
    expect(api.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("backgrounds the session and confirms on button press", async () => {
    const api = makeApi();
    noteRunning(api);
    await vi.advanceTimersByTimeAsync(30_000);

    const answerCallbackQuery = vi.fn().mockResolvedValue(undefined);
    const editMessageText = vi.fn().mockResolvedValue(true);
    const ctx = {
      callbackQuery: {
        data: `${BACKGROUND_OFFER_PREFIX}ses-1`,
        message: { message_id: 42 },
      },
      chat: { id: -100 },
      api: { editMessageText },
      answerCallbackQuery,
    };

    await expect(handleToolBackgroundCallback(ctx as never)).resolves.toBe(true);
    expect(mocked.backgroundMock).toHaveBeenCalledWith({ sessionID: "ses-1" });
    expect(answerCallbackQuery).toHaveBeenCalled();
    expect(editMessageText).toHaveBeenCalledWith(-100, 42, expect.any(String));
  });

  it("shows an error toast when backgrounding fails and keeps the message", async () => {
    mocked.backgroundMock.mockResolvedValue({ data: undefined, error: new Error("busy") });
    const answerCallbackQuery = vi.fn().mockResolvedValue(undefined);
    const editMessageText = vi.fn().mockResolvedValue(true);
    const ctx = {
      callbackQuery: {
        data: `${BACKGROUND_OFFER_PREFIX}ses-1`,
        message: { message_id: 42 },
      },
      chat: { id: -100 },
      api: { editMessageText },
      answerCallbackQuery,
    };

    await expect(handleToolBackgroundCallback(ctx as never)).resolves.toBe(true);
    const answeredText = answerCallbackQuery.mock.calls[0]?.[0]?.text as string;
    expect(typeof answeredText === "string" && answeredText.length > 0).toBe(true);
    expect(editMessageText).not.toHaveBeenCalled();
  });

  it("ignores unrelated callbacks", async () => {
    const ctx = {
      callbackQuery: { data: "queue:clearall" },
      chat: { id: -100 },
      api: {},
      answerCallbackQuery: vi.fn(),
    };

    await expect(handleToolBackgroundCallback(ctx as never)).resolves.toBe(false);
    expect(mocked.backgroundMock).not.toHaveBeenCalled();
  });

  it("clearSessionBackgroundOffers drops pending timers and unpressed offers", async () => {
    const api = makeApi();
    noteRunning(api);
    clearSessionBackgroundOffers("ses-1");

    await vi.advanceTimersByTimeAsync(60_000);
    expect(api.sendMessage).not.toHaveBeenCalled();

    noteRunning(api);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(api.sendMessage).toHaveBeenCalledTimes(1);
    clearSessionBackgroundOffers("ses-1");
    expect(api.deleteMessage).toHaveBeenCalledWith(-100, 42);
  });
});
