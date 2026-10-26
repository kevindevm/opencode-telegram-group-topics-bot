import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "grammy";

const mocked = vi.hoisted(() => ({
  buildKeyboardMock: vi.fn(),
  formatMenuMock: vi.fn(() => "menu"),
  parseCallbackMock: vi.fn(),
  toggleFlagMock: vi.fn(),
  replyWithInlineMenuMock: vi.fn().mockResolvedValue(42),
  ensureActiveInlineMenuMock: vi.fn().mockResolvedValue(true),
  showAgentSelectionMenuMock: vi.fn().mockResolvedValue(undefined),
  fetchCurrentAgentMock: vi.fn().mockResolvedValue("build"),
}));

vi.mock("../../../src/display/manager.js", () => ({
  DISPLAY_AGENTS_CALLBACK: "display:agents",
  DISPLAY_CALLBACK_PREFIX: "display:toggle:",
  buildDisplayKeyboard: mocked.buildKeyboardMock,
  formatDisplayMenu: mocked.formatMenuMock,
  parseDisplayCallback: mocked.parseCallbackMock,
  toggleDisplayFlag: mocked.toggleFlagMock,
}));

vi.mock("../../../src/bot/handlers/inline-menu.js", () => ({
  ensureActiveInlineMenu: mocked.ensureActiveInlineMenuMock,
  replyWithInlineMenu: mocked.replyWithInlineMenuMock,
}));

vi.mock("../../../src/bot/handlers/agent.js", () => ({
  showAgentSelectionMenu: mocked.showAgentSelectionMenuMock,
}));

vi.mock("../../../src/agent/manager.js", () => ({
  fetchCurrentAgent: mocked.fetchCurrentAgentMock,
}));

import {
  displayCommand,
  handleDisplayCallback,
} from "../../../src/bot/commands/display.js";
import { createScopeKeyFromParams, SCOPE_CONTEXT } from "../../../src/bot/scope.js";
import { t } from "../../../src/i18n/index.js";

function createCommandContext(): Context {
  return {
    chat: { id: -100123, type: "supergroup" },
    message: { message_thread_id: 7 },
    reply: vi.fn().mockResolvedValue(undefined),
  } as unknown as Context;
}

function createCallbackContext(data: string): Context {
  return {
    chat: { id: -100123, type: "supergroup" },
    callbackQuery: {
      data,
      message: { message_id: 5, message_thread_id: 9 },
    },
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    editMessageText: vi.fn().mockResolvedValue(undefined),
  } as unknown as Context;
}

describe("bot/commands/display", () => {
  beforeEach(() => {
    mocked.buildKeyboardMock.mockReset().mockReturnValue("keyboard");
    mocked.formatMenuMock.mockReset().mockReturnValue("menu");
    mocked.parseCallbackMock.mockReset();
    mocked.toggleFlagMock.mockReset();
    mocked.replyWithInlineMenuMock.mockClear().mockResolvedValue(42);
    mocked.ensureActiveInlineMenuMock.mockReset().mockResolvedValue(true);
    mocked.showAgentSelectionMenuMock.mockReset().mockResolvedValue(undefined);
    mocked.fetchCurrentAgentMock.mockReset().mockResolvedValue("build");
  });

  it("opens the display menu as a cancellable inline menu", async () => {
    const ctx = createCommandContext();

    await displayCommand(ctx as never);

    expect(mocked.fetchCurrentAgentMock).toHaveBeenCalled();
    expect(mocked.buildKeyboardMock).toHaveBeenCalled();
    expect(mocked.replyWithInlineMenuMock).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ menuKind: "display", text: "menu", keyboard: "keyboard" }),
    );
  });

  it("toggles the flag and re-renders the menu", async () => {
    mocked.parseCallbackMock.mockReturnValue("thinking");
    mocked.toggleFlagMock.mockReturnValue(true);
    const ctx = createCallbackContext("display:toggle:thinking");

    expect(await handleDisplayCallback(ctx)).toBe(true);

    expect(mocked.ensureActiveInlineMenuMock).toHaveBeenCalledWith(ctx, "display");
    expect(mocked.toggleFlagMock).toHaveBeenCalledWith("thinking", expect.any(String));
    expect(ctx.answerCallbackQuery).toHaveBeenCalled();
    expect(ctx.editMessageText).toHaveBeenCalledWith("menu", { reply_markup: "keyboard" });
  });

  it("opens the agent picker from the agent shortcut", async () => {
    const ctx = createCallbackContext("display:agents");

    expect(await handleDisplayCallback(ctx)).toBe(true);

    expect(mocked.ensureActiveInlineMenuMock).toHaveBeenCalledWith(ctx, "display");
    expect(mocked.showAgentSelectionMenuMock).toHaveBeenCalledWith(ctx);
    expect(mocked.toggleFlagMock).not.toHaveBeenCalled();
  });

  it("answers with an error when toggling fails", async () => {
    mocked.parseCallbackMock.mockReturnValue("thinking");
    mocked.toggleFlagMock.mockReturnValue(false);
    const ctx = createCallbackContext("display:toggle:thinking");

    expect(await handleDisplayCallback(ctx)).toBe(true);

    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith({
      text: t("callback.processing_error"),
    });
    expect(ctx.editMessageText).not.toHaveBeenCalled();
  });

  it("ignores unrelated callbacks", async () => {
    mocked.parseCallbackMock.mockReturnValue(null);
    const ctx = createCallbackContext("model:result:0");

    expect(await handleDisplayCallback(ctx)).toBe(false);
    expect(mocked.toggleFlagMock).not.toHaveBeenCalled();
  });

  it("toggles per topic when the menu lives in a thread", async () => {
    mocked.parseCallbackMock.mockReturnValue("thinking");
    mocked.toggleFlagMock.mockReturnValue(true);
    const scopeKey = createScopeKeyFromParams({
      chatId: -100123,
      threadId: 9,
      context: SCOPE_CONTEXT.GROUP_TOPIC,
    });
    const ctx = {
      chat: { id: -100123, type: "supergroup" },
      callbackQuery: {
        data: "display:toggle:thinking",
        message: { message_id: 5, message_thread_id: 9 },
      },
      answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
      editMessageText: vi.fn().mockResolvedValue(undefined),
    } as unknown as Context;

    expect(await handleDisplayCallback(ctx)).toBe(true);

    expect(mocked.toggleFlagMock).toHaveBeenCalledWith("thinking", scopeKey);
  });
});
