import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "grammy";

const mocked = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  replyWithInlineMenuMock: vi.fn(),
  getScopeMock: vi.fn(() => ({ key: "chat:-100123:10", threadId: 10 })),
  getScopeKeyMock: vi.fn(() => "chat:-100123:10"),
}));

vi.mock("../../../src/session/manager.js", () => ({
  getCurrentSession: mocked.getSessionMock,
}));

vi.mock("../../../src/bot/handlers/inline-menu.js", () => ({
  replyWithInlineMenu: mocked.replyWithInlineMenuMock,
  ensureActiveInlineMenu: vi.fn(),
  clearActiveInlineMenu: vi.fn(),
}));

vi.mock("../../../src/bot/scope.js", () => ({
  GENERAL_TOPIC_THREAD_ID: 1,
  SCOPE_CONTEXT: { GROUP_TOPIC: "group_topic", GROUP_GENERAL: "group_general" },
  getScopeFromContext: mocked.getScopeMock,
  getScopeKeyFromContext: mocked.getScopeKeyMock,
  getThreadSendOptions: (threadId: number | null) =>
    threadId === null ? {} : { message_thread_id: threadId },
  getChatActionThreadOptions: () => ({}),
}));

import { compactCommand } from "../../../src/bot/handlers/context.js";
import { t } from "../../../src/i18n/index.js";

function createCommandContext(): Context {
  return {
    chat: { id: -100123, type: "supergroup" },
    reply: vi.fn().mockResolvedValue({ message_id: 1 }),
  } as unknown as Context;
}

describe("bot/handlers/context compact command", () => {
  beforeEach(() => {
    mocked.getSessionMock.mockReset().mockReturnValue({ id: "s1", title: "work" });
    mocked.replyWithInlineMenuMock.mockReset().mockResolvedValue(7);
    mocked.getScopeMock.mockReset().mockReturnValue({ key: "chat:-100123:10", threadId: 10 });
    mocked.getScopeKeyMock.mockReset().mockReturnValue("chat:-100123:10");
  });

  it("refuses to run in General", async () => {
    mocked.getScopeMock.mockReturnValue({ key: "global", threadId: 1, context: "group_general" });
    const ctx = createCommandContext();
    (ctx.chat as Record<string, unknown>).is_forum = true;

    await compactCommand(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith(t("context.general_not_available"), {
      message_thread_id: 1,
    });
    expect(mocked.replyWithInlineMenuMock).not.toHaveBeenCalled();
  });

  it("requires an active session", async () => {
    mocked.getSessionMock.mockReturnValue(null);
    const ctx = createCommandContext();

    await compactCommand(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith(t("context.no_active_session"), {
      message_thread_id: 10,
    });
    expect(mocked.replyWithInlineMenuMock).not.toHaveBeenCalled();
  });

  it("posts the compact confirmation menu", async () => {
    const ctx = createCommandContext();

    await compactCommand(ctx as never);

    expect(mocked.replyWithInlineMenuMock).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ menuKind: "context" }),
    );
  });
});
