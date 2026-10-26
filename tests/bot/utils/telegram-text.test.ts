import { describe, expect, it, vi } from "vitest";
import {
  editBotRenderedPart,
  editBotText,
  sendBotRenderedPart,
  sendBotText,
} from "../../../src/bot/utils/telegram-text.js";

vi.mock("../../../src/display/manager.js", () => ({
  DISPLAY_FLAG: { LINK_PREVIEWS: "linkPreviews" },
  isDisplayVisible: vi.fn(() => true),
}));

import { isDisplayVisible } from "../../../src/display/manager.js";

describe("bot/utils/telegram-text", () => {
  it("sends raw text by default", async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);

    await sendBotText({
      api: { sendMessage },
      chatId: 123,
      text: "hello",
      options: { disable_notification: true },
    });

    expect(sendMessage).toHaveBeenCalledWith(123, "hello", {
      link_preview_options: { is_disabled: true },
      disable_notification: true,
    });
  });

  it("sends bot control text without link previews", async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);

    await sendBotText({
      api: { sendMessage },
      chatId: 123,
      text: "https://example.com/page",
    });

    expect(sendMessage).toHaveBeenCalledWith(123, "https://example.com/page", {
      link_preview_options: { is_disabled: true },
    });
  });

  it("sends markdown_v2 text with markdown parse mode", async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);

    await sendBotText({
      api: { sendMessage },
      chatId: 123,
      text: "*hello*",
      format: "markdown_v2",
    });

    expect(sendMessage).toHaveBeenCalledWith(123, "*hello*", {
      link_preview_options: { is_disabled: true },
      parse_mode: "MarkdownV2",
    });
  });

  it("uses raw fallback text when markdown parse fails", async () => {
    const sendMessage = vi
      .fn()
      .mockRejectedValueOnce(
        new Error("Bad Request: can't parse entities: Character '.' is reserved"),
      )
      .mockRejectedValueOnce(new Error("Bad Request: can't parse entities: unsupported start tag"))
      .mockResolvedValueOnce(undefined);

    await sendBotText({
      api: { sendMessage },
      chatId: 100,
      text: "Build succeeded.",
      rawFallbackText: "Build succeeded.",
      format: "markdown_v2",
    });

    expect(sendMessage).toHaveBeenCalledTimes(3);
    expect(sendMessage).toHaveBeenNthCalledWith(3, 100, "Build succeeded.", {
      link_preview_options: { is_disabled: true },
    });
  });

  it("edits raw text by default", async () => {
    const editMessageText = vi.fn().mockResolvedValue(undefined);

    await editBotText({
      api: { editMessageText },
      chatId: 321,
      messageId: 9,
      text: "hello",
    });

    expect(editMessageText).toHaveBeenCalledWith(321, 9, "hello", {
      link_preview_options: { is_disabled: true },
    });
  });

  it("sends rendered assistant parts with link previews when enabled", async () => {
    vi.mocked(isDisplayVisible).mockReturnValue(true);
    const sendMessage = vi.fn().mockResolvedValue(undefined);

    await sendBotRenderedPart({
      api: { sendMessage },
      chatId: 123,
      part: { text: "see https://example.com", fallbackText: "see https://example.com" },
    });

    expect(sendMessage).toHaveBeenCalledWith(123, "see https://example.com", {
      link_preview_options: { is_disabled: false },
    });
  });

  it("disables link previews on rendered parts when the display flag is off", async () => {
    vi.mocked(isDisplayVisible).mockReturnValue(false);
    const sendMessage = vi.fn().mockResolvedValue(undefined);

    await sendBotRenderedPart({
      api: { sendMessage },
      chatId: 123,
      part: { text: "see https://example.com", fallbackText: "see https://example.com" },
    });

    expect(sendMessage).toHaveBeenCalledWith(123, "see https://example.com", {
      link_preview_options: { is_disabled: true },
    });
  });

  it("edits rendered assistant parts honoring the display flag", async () => {
    vi.mocked(isDisplayVisible).mockReturnValue(false);
    const editMessageText = vi.fn().mockResolvedValue(undefined);

    await editBotRenderedPart({
      api: { editMessageText },
      chatId: 321,
      messageId: 9,
      part: { text: "see https://example.com", fallbackText: "see https://example.com" },
    });

    expect(editMessageText).toHaveBeenCalledWith(321, 9, "see https://example.com", {
      link_preview_options: { is_disabled: true },
    });
  });

  it("propagates not-modified errors from rendered edits without a fallback attempt", async () => {
    vi.mocked(isDisplayVisible).mockReturnValue(true);
    const editMessageText = vi
      .fn()
      .mockRejectedValueOnce(new Error("Bad Request: message is not modified"));

    await expect(
      editBotRenderedPart({
        api: { editMessageText },
        chatId: 321,
        messageId: 9,
        part: {
          text: "bold",
          fallbackText: "bold",
          entities: [{ type: "bold", offset: 0, length: 4 }],
          source: "entities",
        },
      }),
    ).rejects.toThrow("message is not modified");

    expect(editMessageText).toHaveBeenCalledTimes(1);
  });
});

describe("bot/utils/telegram-text truncateTelegramText", () => {
  it("leaves short text untouched", async () => {
    const { truncateTelegramText } = await import("../../../src/bot/utils/telegram-text.js");
    expect(truncateTelegramText("hello")).toBe("hello");
    expect(truncateTelegramText("x".repeat(4096))).toHaveLength(4096);
  });

  it("truncates long interactive text so Telegram accepts it", async () => {
    const { truncateTelegramText } = await import("../../../src/bot/utils/telegram-text.js");
    const truncated = truncateTelegramText(`prefix ${"y".repeat(5000)}`, 100);
    expect(truncated.length).toBeLessThanOrEqual(100);
    expect(truncated.startsWith("prefix ")).toBe(true);
  });
});
