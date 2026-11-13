import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  isDisplayVisibleMock: vi.fn(() => true),
  sendTextMock: vi.fn().mockResolvedValue(42),
  getTopicBindingBySessionIdMock: vi.fn(() => undefined),
}));

vi.mock("../../../src/display/manager.js", () => ({
  DISPLAY_FLAG: { BACKGROUND: "background" },
  isDisplayVisible: mocked.isDisplayVisibleMock,
}));

vi.mock("../../../src/topic/manager.js", () => ({
  getTopicBindingBySessionId: mocked.getTopicBindingBySessionIdMock,
}));

vi.mock("../../../src/utils/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { createBackgroundNoticeDelivery, __resetBackgroundNoticesForTests, __setBackgroundNoticeGraceMsForTests } from "../../../src/bot/events/background-notice-delivery.js";
import type { TelegramEventDelivery } from "../../../src/bot/events/telegram-event-delivery.js";
import { permissionManager } from "../../../src/permission/manager.js";
import { questionManager } from "../../../src/question/manager.js";

function createDelivery() {
  const delivery = {
    sendText: mocked.sendTextMock,
  } as unknown as TelegramEventDelivery;
  return createBackgroundNoticeDelivery({ getDestination: () => null }, delivery);
}

describe("bot/events/background-notice-delivery", () => {
  beforeEach(() => {
    mocked.getTopicBindingBySessionIdMock.mockReset();
    mocked.getTopicBindingBySessionIdMock.mockReturnValue(undefined);
    __resetBackgroundNoticesForTests();
    __setBackgroundNoticeGraceMsForTests(0);
  });

  afterEach(() => {
    __setBackgroundNoticeGraceMsForTests(3000);
  });

  it("sends the notice into the session topic thread", async () => {
    mocked.sendTextMock.mockClear();
    const send = createBackgroundNoticeDelivery(
      {
        getDestination: () => ({ api: {} as never, chatId: -1001, threadId: 555 }),
      },
      { sendText: mocked.sendTextMock } as unknown as TelegramEventDelivery,
    );

    await send({ kind: "assistant_response", sessionId: "ses-1" });

    expect(mocked.sendTextMock).toHaveBeenCalledTimes(1);
    const [destination, , options] = mocked.sendTextMock.mock.calls[0] as [
      { chatId: number; threadId: number },
      string,
      Record<string, unknown>,
    ];
    expect(destination).toEqual({ api: expect.anything(), chatId: -1001, threadId: 555 });
    expect(options).toMatchObject({ message_thread_id: 555 });
    expect(options.reply_markup).toBeDefined();
  });

  it("skips delivery without a destination or when the flag is hidden", async () => {
    mocked.sendTextMock.mockClear();

    await createDelivery()({ kind: "question_asked", sessionId: "ses-2" });
    expect(mocked.sendTextMock).not.toHaveBeenCalled();

    mocked.isDisplayVisibleMock.mockReturnValueOnce(false);
    const send = createBackgroundNoticeDelivery(
      {
        getDestination: () => ({ api: {} as never, chatId: -1001, threadId: null }),
      },
      { sendText: mocked.sendTextMock } as unknown as TelegramEventDelivery,
    );
    await send({ kind: "permission_asked", sessionId: "ses-3" });
    expect(mocked.sendTextMock).not.toHaveBeenCalled();
  });

  it("names the topic instead of the raw session id", async () => {
    mocked.getTopicBindingBySessionIdMock.mockReturnValue({ topicName: "free claimer" });
    const send = createBackgroundNoticeDelivery(
      {
        getDestination: () => ({ api: {} as never, chatId: -1001, threadId: 42 }),
      },
      { sendText: mocked.sendTextMock } as unknown as TelegramEventDelivery,
    );

    await send({ kind: "permission_asked", sessionId: "ses_f54a9b71" });

    expect(mocked.sendTextMock).toHaveBeenCalledTimes(1);
    const text = mocked.sendTextMock.mock.calls[0]?.[1] as string;
    expect(text).toContain("free claimer");
    expect(text).not.toContain("ses_f54a9b71");
  });

  it("falls back to the session id when no topic or title is known", async () => {
    const send = createBackgroundNoticeDelivery(
      {
        getDestination: () => ({ api: {} as never, chatId: -1001, threadId: 42 }),
      },
      { sendText: mocked.sendTextMock } as unknown as TelegramEventDelivery,
    );

    await send({ kind: "permission_asked", sessionId: "ses_f54a9b71" });

    const text = mocked.sendTextMock.mock.calls[0]?.[1] as string;
    expect(text).toContain("ses_f54a");
  });

  it("sends one notice per session and kind until it expires", async () => {
    const send = createBackgroundNoticeDelivery(
      {
        getDestination: () => ({ api: {} as never, chatId: -1001, threadId: 42 }),
      },
      { sendText: mocked.sendTextMock } as unknown as TelegramEventDelivery,
    );
    mocked.sendTextMock.mockClear();

    await send({ kind: "permission_asked", sessionId: "ses-9" });
    await send({ kind: "permission_asked", sessionId: "ses-9" });
    await send({ kind: "question_asked", sessionId: "ses-9" });

    // First permission notice + the question notice; the duplicate is dropped.
    expect(mocked.sendTextMock).toHaveBeenCalledTimes(2);
  });

  it("skips permission notices settled outside Telegram", async () => {
    mocked.getTopicBindingBySessionIdMock.mockReturnValue({ scopeKey: "scope-settled" });
    permissionManager.markSettled("req-settled-1");
    const send = createBackgroundNoticeDelivery(
      {
        getDestination: () => ({ api: {} as never, chatId: -1001, threadId: 42 }),
      },
      { sendText: mocked.sendTextMock } as unknown as TelegramEventDelivery,
    );
    mocked.sendTextMock.mockClear();

    await send({ kind: "permission_asked", sessionId: "ses-10", requestId: "req-settled-1" });

    expect(mocked.sendTextMock).not.toHaveBeenCalled();
  });

  it("skips the notice when the prompt is already active in its topic", async () => {
    mocked.getTopicBindingBySessionIdMock.mockReturnValue({ scopeKey: "scope-active" });
    permissionManager.startPermission(
      {
        id: "req-active-1",
        sessionID: "ses-11",
        permission: "bash",
        patterns: ["ls"],
        metadata: {},
        always: [],
      },
      777,
      "scope-active",
    );
    const send = createBackgroundNoticeDelivery(
      {
        getDestination: () => ({ api: {} as never, chatId: -1001, threadId: 42 }),
      },
      { sendText: mocked.sendTextMock } as unknown as TelegramEventDelivery,
    );
    mocked.sendTextMock.mockClear();

    try {
      await send({ kind: "permission_asked", sessionId: "ses-11", requestId: "req-active-1" });

      expect(mocked.sendTextMock).not.toHaveBeenCalled();
    } finally {
      permissionManager.clear("scope-active");
    }
  });

  it("skips question notices settled outside Telegram", async () => {
    mocked.getTopicBindingBySessionIdMock.mockReturnValue({ scopeKey: "scope-q" });
    questionManager.markSettled("req-q-settled-1");
    const send = createBackgroundNoticeDelivery(
      {
        getDestination: () => ({ api: {} as never, chatId: -1001, threadId: 42 }),
      },
      { sendText: mocked.sendTextMock } as unknown as TelegramEventDelivery,
    );
    mocked.sendTextMock.mockClear();

    await send({ kind: "question_asked", sessionId: "ses-12", requestId: "req-q-settled-1" });

    expect(mocked.sendTextMock).not.toHaveBeenCalled();
  });

  it("still notifies a pending request with no prompt in its topic", async () => {
    mocked.getTopicBindingBySessionIdMock.mockReturnValue({ scopeKey: "scope-pending" });
    const send = createBackgroundNoticeDelivery(
      {
        getDestination: () => ({ api: {} as never, chatId: -1001, threadId: 42 }),
      },
      { sendText: mocked.sendTextMock } as unknown as TelegramEventDelivery,
    );
    mocked.sendTextMock.mockClear();

    await send({ kind: "permission_asked", sessionId: "ses-13", requestId: "req-pending-1" });

    expect(mocked.sendTextMock).toHaveBeenCalledTimes(1);
  });
});
