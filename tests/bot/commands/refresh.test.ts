import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "grammy";

const mocked = vi.hoisted(() => ({
  listMock: vi.fn(),
  getMock: vi.fn(),
  getSessionMock: vi.fn(),
  setSessionMock: vi.fn(),
  getProjectMock: vi.fn(),
  setSessionAggMock: vi.fn(),
  ensureSubMock: vi.fn(),
  bindingScopeMock: vi.fn(),
  registerBindingMock: vi.fn(),
  updateBindingStatusMock: vi.fn(),
}));

vi.mock("../../../src/opencode/client.js", () => ({
  opencodeClient: {
    session: {
      list: mocked.listMock,
      get: mocked.getMock,
    },
  },
}));

vi.mock("../../../src/session/manager.js", () => ({
  getCurrentSession: mocked.getSessionMock,
  setCurrentSession: mocked.setSessionMock,
}));

vi.mock("../../../src/settings/manager.js", () => ({
  getCurrentProject: mocked.getProjectMock,
  TOPIC_SESSION_STATUS: { ACTIVE: "active" },
}));

vi.mock("../../../src/summary/aggregator.js", () => ({
  summaryAggregator: {
    setSession: mocked.setSessionAggMock,
    clear: vi.fn(),
    stopTypingIndicator: vi.fn(),
  },
}));

vi.mock("../../../src/bot/scope.js", () => ({
  getScopeFromContext: () => ({ key: "chat:-100123:10", threadId: 10 }),
  getScopeKeyFromContext: () => "chat:-100123:10",
  getThreadSendOptions: (threadId: number | null) =>
    threadId === null ? {} : { message_thread_id: threadId },
}));

vi.mock("../../../src/topic/manager.js", () => ({
  getTopicBindingBySessionId: vi.fn(),
  getTopicBindingByScopeKey: mocked.bindingScopeMock,
  registerTopicSessionBinding: mocked.registerBindingMock,
  updateTopicBindingStatus: mocked.updateBindingStatusMock,
}));

vi.mock("../../../src/bot/index.js", () => ({
  ensureEventSubscription: mocked.ensureSubMock,
}));

import { handleRefreshCommand } from "../../../src/bot/commands/refresh.js";
import { t } from "../../../src/i18n/index.js";

function createContext(): Context {
  return {
    chat: { id: -100123, type: "supergroup" },
    reply: vi.fn().mockResolvedValue({ message_id: 1 }),
  } as unknown as Context;
}

describe("bot/commands/refresh", () => {
  beforeEach(() => {
    mocked.listMock.mockReset().mockResolvedValue({ data: [], error: null });
    mocked.getMock.mockReset();
    mocked.getSessionMock.mockReset().mockReturnValue({
      id: "s1",
      title: "work",
      directory: "/repo/a",
    });
    mocked.setSessionMock.mockReset();
    mocked.getProjectMock.mockReset().mockReturnValue({ id: "p1", worktree: "/repo/a" });
    mocked.setSessionAggMock.mockReset();
    mocked.ensureSubMock.mockReset().mockResolvedValue(undefined);
    mocked.bindingScopeMock.mockReset().mockReturnValue({ sessionId: "s1" });
    mocked.registerBindingMock.mockReset();
    mocked.updateBindingStatusMock.mockReset();
  });

  it("revives an abandoned topic whose session still exists", async () => {
    mocked.getSessionMock.mockReturnValue(null);
    mocked.getMock.mockResolvedValue({
      data: { id: "s1", title: "work" },
      error: null,
    });
    const ctx = createContext();

    const result = await handleRefreshCommand(ctx as never);

    expect(result).toBe(true);
    expect(mocked.setSessionMock).toHaveBeenCalledWith(
      { id: "s1", title: "work", directory: "/repo/a" },
      "chat:-100123:10",
    );
    expect(mocked.updateBindingStatusMock).toHaveBeenCalledWith(-100123, 10, "active");
    expect(ctx.reply).not.toHaveBeenCalledWith(t("sessions.select_error"), expect.anything());
  });

  it("still fails when the abandoned session is gone", async () => {
    mocked.getSessionMock.mockReturnValue(null);
    mocked.getMock.mockResolvedValue({ data: null, error: new Error("gone") });
    const ctx = createContext();

    const result = await handleRefreshCommand(ctx as never);

    expect(result).toBe(true);
    expect(ctx.reply).toHaveBeenCalledWith(t("sessions.select_error"), {
      message_thread_id: 10,
    });
    expect(mocked.setSessionMock).not.toHaveBeenCalled();
  });
});
