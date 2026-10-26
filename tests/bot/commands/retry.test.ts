import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "grammy";

const mocked = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  historyMock: vi.fn(),
  processPromptMock: vi.fn(),
}));

vi.mock("../../../src/session/manager.js", () => ({
  getCurrentSession: mocked.getSessionMock,
}));

vi.mock("../../../src/session/history.js", () => ({
  loadLastUserMessage: mocked.historyMock,
}));

vi.mock("../../../src/bot/handlers/prompt.js", () => ({
  processUserPrompt: mocked.processPromptMock,
}));

vi.mock("../../../src/bot/scope.js", () => ({
  getScopeFromContext: () => ({ key: "scope-1", threadId: 9 }),
  getThreadSendOptions: (threadId: number | null) =>
    threadId === null ? {} : { message_thread_id: threadId },
}));

import { createRetryCommand } from "../../../src/bot/commands/retry.js";
import { t } from "../../../src/i18n/index.js";

function createCommandContext(match: string): Context {
  return {
    match,
    reply: vi.fn().mockResolvedValue(undefined),
  } as unknown as Context;
}

describe("bot/commands/retry", () => {
  const deps = { bot: {}, ensureEventSubscription: vi.fn() } as never;

  beforeEach(() => {
    mocked.getSessionMock.mockReset().mockReturnValue({
      id: "session-1",
      title: "Session",
      directory: "/repo/app",
    });
    mocked.historyMock.mockReset().mockResolvedValue({ role: "user", text: "fix it", created: 1 });
    mocked.processPromptMock.mockReset().mockResolvedValue(true);
  });

  it("reports no session without one", async () => {
    mocked.getSessionMock.mockReturnValue(undefined);
    const ctx = createCommandContext("");

    await createRetryCommand(deps)(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith(t("retry.no_session"), { message_thread_id: 9 });
  });

  it("sends edited text directly", async () => {
    const ctx = createCommandContext("do it better");

    await createRetryCommand(deps)(ctx as never);

    expect(mocked.processPromptMock).toHaveBeenCalledWith(ctx, "do it better", deps);
    expect(mocked.historyMock).not.toHaveBeenCalled();
  });

  it("resends the last user message", async () => {
    const ctx = createCommandContext("");

    await createRetryCommand(deps)(ctx as never);

    expect(mocked.historyMock).toHaveBeenCalledWith("session-1", "/repo/app");
    expect(mocked.processPromptMock).toHaveBeenCalledWith(ctx, "fix it", deps);
  });

  it("reports an empty history", async () => {
    mocked.historyMock.mockResolvedValue(null);
    const ctx = createCommandContext("");

    await createRetryCommand(deps)(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith(t("retry.empty"), { message_thread_id: 9 });
    expect(mocked.processPromptMock).not.toHaveBeenCalled();
  });
});
