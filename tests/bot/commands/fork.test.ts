import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "grammy";

const mocked = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  getProjectMock: vi.fn(),
  getAgentMock: vi.fn(),
  getModelMock: vi.fn(),
  forkMock: vi.fn(),
  createMock: vi.fn(),
}));

vi.mock("../../../src/session/manager.js", () => ({
  getCurrentSession: mocked.getSessionMock,
  setCurrentSession: vi.fn(),
}));

vi.mock("../../../src/settings/manager.js", () => ({
  getCurrentProject: mocked.getProjectMock,
  setCurrentProject: vi.fn(),
  setCurrentAgent: vi.fn(),
  setCurrentModel: vi.fn(),
  TOPIC_SESSION_STATUS: { ACTIVE: "active" },
}));

vi.mock("../../../src/agent/manager.js", () => ({
  getStoredAgent: mocked.getAgentMock,
  resolveProjectAgent: vi.fn(async (agent: string) => agent),
}));

vi.mock("../../../src/model/manager.js", () => ({
  getStoredModel: mocked.getModelMock,
}));

vi.mock("../../../src/opencode/client.js", () => ({
  opencodeClient: { session: { create: mocked.createMock } },
  opencodeServerVersion: "v2",
  opencodeV2Client: { session: { fork: mocked.forkMock } },
}));

vi.mock("../../../src/topic/manager.js", () => ({
  registerTopicSessionBinding: vi.fn(),
}));

vi.mock("../../../src/pinned/manager.js", () => ({
  pinnedMessageManager: {
    initialize: vi.fn(),
    isInitialized: vi.fn(() => true),
    onSessionChange: vi.fn(),
  },
}));

vi.mock("../../../src/keyboard/manager.js", () => ({
  keyboardManager: { initialize: vi.fn() },
}));

vi.mock("../../../src/summary/aggregator.js", () => ({
  summaryAggregator: { setSession: vi.fn(), clear: vi.fn() },
}));

vi.mock("../../../src/session/cache-manager.js", () => ({
  ingestSessionInfoForCache: vi.fn(),
  __resetSessionDirectoryCacheForTests: vi.fn(),
}));

vi.mock("../../../src/project/directory.js", () => ({
  projectDirectoryExists: vi.fn(async () => true),
}));

vi.mock("../../../src/bot/scope.js", () => ({
  SCOPE_CONTEXT: { GROUP_TOPIC: "group-topic" },
  createScopeKeyFromParams: ({ chatId, threadId }: { chatId: number; threadId: number }) =>
    `${chatId}:${threadId}`,
  getScopeFromContext: () => ({ key: "-100123:9", threadId: 9 }),
  getThreadSendOptions: (threadId: number | null) =>
    threadId === null ? {} : { message_thread_id: threadId },
  isTopicScope: () => true,
}));

import { createForkCommand } from "../../../src/bot/commands/fork.js";

function createCommandContext(): Context {
  return {
    chat: { id: -100123, type: "supergroup" },
    reply: vi.fn().mockResolvedValue(undefined),
    api: { createForumTopic: vi.fn().mockResolvedValue({ message_thread_id: 99 }) },
  } as unknown as Context;
}

describe("bot/commands/fork", () => {
  const deps = { ensureEventSubscription: vi.fn() };

  beforeEach(() => {
    mocked.getSessionMock.mockReset().mockReturnValue({
      id: "session-1",
      title: "Session",
      directory: "/repo/app",
    });
    mocked.getProjectMock.mockReset().mockReturnValue({ id: "p1", worktree: "/repo/app" });
    mocked.getAgentMock.mockReset().mockReturnValue("build");
    mocked.getModelMock.mockReset().mockReturnValue({ providerID: "p", modelID: "m" });
    mocked.forkMock.mockReset().mockResolvedValue({
      data: { id: "session-2", title: "Fork" },
      error: null,
    });
  });

  it("forks into a new topic", async () => {
    const ctx = createCommandContext();

    await createForkCommand(deps as never)(ctx as never);

    expect(mocked.forkMock).toHaveBeenCalledWith({ sessionID: "session-1" });
    expect(ctx.api.createForumTopic).toHaveBeenCalledWith(
      -100123,
      expect.anything(),
      expect.anything(),
    );
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("Fork"), {
      message_thread_id: 9,
    });
  });

  it("reports fork failures", async () => {
    mocked.forkMock.mockResolvedValue({ data: null, error: new Error("nope") });
    const ctx = createCommandContext();

    await createForkCommand(deps as never)(ctx as never);

    expect(ctx.api.createForumTopic).not.toHaveBeenCalled();
  });
});
