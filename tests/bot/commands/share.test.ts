import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "grammy";

const mocked = vi.hoisted(() => ({
  historyMock: vi.fn(),
  getSessionMock: vi.fn(),
}));

vi.mock("../../../src/session/history.js", () => ({
  loadSessionHistoryItems: mocked.historyMock,
}));

vi.mock("../../../src/session/manager.js", () => ({
  getCurrentSession: mocked.getSessionMock,
}));

vi.mock("../../../src/bot/scope.js", () => ({
  getScopeFromContext: () => ({ key: "scope-1", threadId: 9 }),
  getThreadSendOptions: (threadId: number | null) =>
    threadId === null ? {} : { message_thread_id: threadId },
}));

import { shareCommand } from "../../../src/bot/commands/share.js";
import { t } from "../../../src/i18n/index.js";

function createCommandContext(): Context {
  return {
    chat: { id: -100123, type: "supergroup" },
    reply: vi.fn().mockResolvedValue(undefined),
    api: { sendDocument: vi.fn().mockResolvedValue(undefined) },
  } as unknown as Context;
}

describe("bot/commands/share", () => {
  beforeEach(() => {
    mocked.getSessionMock.mockReset().mockReturnValue({
      id: "session-1234567890",
      title: "Session",
      directory: "/repo/app",
    });
    mocked.historyMock.mockReset().mockResolvedValue([
      { role: "user", text: "do it", created: 1 },
      { role: "assistant", text: "done", created: 2 },
    ]);
  });

  it("reports no session without one", async () => {
    mocked.getSessionMock.mockReturnValue(undefined);
    const ctx = createCommandContext();

    await shareCommand(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith(t("share.no_session"), { message_thread_id: 9 });
  });

  it("sends the transcript as a document", async () => {
    const ctx = createCommandContext();

    await shareCommand(ctx as never);

    expect(ctx.api.sendDocument).toHaveBeenCalledWith(
      -100123,
      expect.anything(),
      expect.objectContaining({
        caption: t("share.caption", { title: "Session" }),
        message_thread_id: 9,
      }),
    );
  });

  it("reports an empty history", async () => {
    mocked.historyMock.mockResolvedValue([]);
    const ctx = createCommandContext();

    await shareCommand(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith(t("share.empty"), { message_thread_id: 9 });
  });
});
