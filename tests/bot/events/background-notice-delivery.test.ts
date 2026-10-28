import { describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  isDisplayVisibleMock: vi.fn(() => true),
  sendTextMock: vi.fn().mockResolvedValue(42),
}));

vi.mock("../../../src/display/manager.js", () => ({
  DISPLAY_FLAG: { BACKGROUND: "background" },
  isDisplayVisible: mocked.isDisplayVisibleMock,
}));

vi.mock("../../../src/utils/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { createBackgroundNoticeDelivery } from "../../../src/bot/events/background-notice-delivery.js";
import type { TelegramEventDelivery } from "../../../src/bot/events/telegram-event-delivery.js";

function createDelivery() {
  const delivery = {
    sendText: mocked.sendTextMock,
  } as unknown as TelegramEventDelivery;
  return createBackgroundNoticeDelivery({ getDestination: () => null }, delivery);
}

describe("bot/events/background-notice-delivery", () => {
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
});
