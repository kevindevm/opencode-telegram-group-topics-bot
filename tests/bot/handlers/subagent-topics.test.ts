import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  bindingsBySession: new Map<string, any>(),
  routeTarget: null as null | { chatId: number; threadId: number | null; scopeKey: string },
  registered: [] as any[],
}));

vi.mock("../../../src/topic/manager.js", () => ({
  getSessionRouteTarget: vi.fn((_sessionId: string) => mocked.routeTarget),
  getTopicBindingBySessionId: vi.fn((sessionId: string) =>
    mocked.bindingsBySession.get(sessionId),
  ),
  getTopicBindingByScopeKey: vi.fn((scopeKey: string) =>
    Array.from(mocked.bindingsBySession.values()).find(
      (binding) => binding.scopeKey === scopeKey,
    ),
  ),
  updateTopicBindingNameBySessionId: vi.fn(),
  registerTopicSessionBinding: vi.fn((input: unknown) => {
    mocked.registered.push(input);
    return input;
  }),
}));

import {
  ensureSubagentTopic,
  finalizeSubagentTopic,
  isEphemeralTopicScope,
} from "../../../src/bot/handlers/subagent-topics.js";

describe("bot/handlers/subagent-topics", () => {
  beforeEach(() => {
    mocked.bindingsBySession.clear();
    mocked.registered.length = 0;
    mocked.routeTarget = null;
    vi.clearAllMocks();
  });

  it("treats an existing child topic as ensured without recreating", async () => {
    mocked.bindingsBySession.set("child-1", { sessionId: "child-1", threadId: 9 });
    const api = { createForumTopic: vi.fn() };

    await expect(
      ensureSubagentTopic(api as never, "parent-1", {
        sessionId: "child-1",
        description: "Inspect",
        agent: "explore",
      }),
    ).resolves.toBe(true);
    expect(api.createForumTopic).not.toHaveBeenCalled();
  });

  it("skips creation without a child session id", async () => {
    const api = { createForumTopic: vi.fn() };

    await expect(
      ensureSubagentTopic(api as never, "parent-1", {
        sessionId: null,
        description: "Inspect",
        agent: "explore",
      }),
    ).resolves.toBe(false);
    expect(api.createForumTopic).not.toHaveBeenCalled();
  });

  it("skips creation for grandchildren of ephemeral topics", async () => {
    mocked.routeTarget = { chatId: -100, threadId: 7, scopeKey: "chat:-100:7" };
    mocked.bindingsBySession.set("parent-1", {
      sessionId: "parent-1",
      ephemeral: true,
      projectId: "p1",
    });
    const api = { createForumTopic: vi.fn().mockResolvedValue({ message_thread_id: 10 }) };

    await expect(
      ensureSubagentTopic(api as never, "parent-1", {
        sessionId: "child-1",
        description: "Deep",
        agent: "general",
      }),
    ).resolves.toBe(false);
    expect(api.createForumTopic).not.toHaveBeenCalled();
  });

  it("creates an ephemeral topic for depth-1 subagents", async () => {
    mocked.routeTarget = { chatId: -100, threadId: 7, scopeKey: "chat:-100:7" };
    mocked.bindingsBySession.set("parent-1", {
      sessionId: "parent-1",
      projectId: "p1",
      projectWorktree: "/repo",
    });
    const api = { createForumTopic: vi.fn().mockResolvedValue({ message_thread_id: 10 }) };

    await expect(
      ensureSubagentTopic(api as never, "parent-1", {
        sessionId: "child-1",
        description: "**Inspect sync**",
        agent: "explore",
      }),
    ).resolves.toBe(true);

    expect(api.createForumTopic).toHaveBeenCalledWith(
      -100,
      expect.stringContaining("Inspect sync"),
    );
    expect(api.createForumTopic.mock.calls[0][1].startsWith("🧩 ")).toBe(true);
    expect(mocked.registered).toHaveLength(1);
    expect(mocked.registered[0]).toMatchObject({
      threadId: 10,
      sessionId: "child-1",
      projectId: "p1",
      projectWorktree: "/repo",
      ephemeral: true,
    });
  });

  it("renames and closes the transcript on terminal status", async () => {
    mocked.bindingsBySession.set("child-1", {
      sessionId: "child-1",
      chatId: -100,
      threadId: 10,
      topicName: "🧩 Inspect sync",
      ephemeral: true,
    });
    const api = {
      editForumTopic: vi.fn().mockResolvedValue(undefined),
      closeForumTopic: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      finalizeSubagentTopic(api as never, "child-1", "completed", "Inspect sync"),
    ).resolves.toBe(true);

    expect(api.editForumTopic).toHaveBeenCalledWith(-100, 10, {
      name: expect.stringContaining("✅"),
    });
    expect(api.closeForumTopic).toHaveBeenCalledWith(-100, 10);
  });

  it("uses the failure icon on error", async () => {
    mocked.bindingsBySession.set("child-1", {
      sessionId: "child-1",
      chatId: -100,
      threadId: 10,
      topicName: "🧩 Inspect sync",
      ephemeral: true,
    });
    const api = {
      editForumTopic: vi.fn().mockResolvedValue(undefined),
      closeForumTopic: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      finalizeSubagentTopic(api as never, "child-1", "error", "Inspect sync"),
    ).resolves.toBe(true);

    expect(api.editForumTopic).toHaveBeenCalledWith(-100, 10, {
      name: expect.stringContaining("❌"),
    });
  });

  it("ignores finalize for regular topics", async () => {
    mocked.bindingsBySession.set("ses-1", { sessionId: "ses-1", threadId: 7 });
    const api = {
      editForumTopic: vi.fn(),
      closeForumTopic: vi.fn(),
    };

    await expect(
      finalizeSubagentTopic(api as never, "ses-1", "completed", "Whatever"),
    ).resolves.toBe(false);
    expect(api.editForumTopic).not.toHaveBeenCalled();
    expect(api.closeForumTopic).not.toHaveBeenCalled();
  });

  it("shares one in-flight topic creation per child", async () => {
    mocked.routeTarget = { chatId: -100, threadId: 7, scopeKey: "chat:-100:7" };
    mocked.bindingsBySession.set("parent-1", {
      sessionId: "parent-1",
      projectId: "p1",
    });
    let resolveCreate!: (value: { message_thread_id: number }) => void;
    const api = {
      createForumTopic: vi.fn().mockImplementation(
        () =>
          new Promise<{ message_thread_id: number }>((resolve) => {
            resolveCreate = resolve;
          }),
      ),
    };

    const info = { sessionId: "child-race", description: "Race", agent: "explore" };
    const first = ensureSubagentTopic(api as never, "parent-1", info);
    const second = ensureSubagentTopic(api as never, "parent-1", info);
    resolveCreate({ message_thread_id: 11 });

    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
    expect(api.createForumTopic).toHaveBeenCalledTimes(1);
  });

  it("skips api calls when the transcript is already finalized", async () => {
    mocked.bindingsBySession.set("child-1", {
      sessionId: "child-1",
      chatId: -100,
      threadId: 10,
      topicName: "✅ Inspect sync",
      ephemeral: true,
    });
    const api = {
      editForumTopic: vi.fn(),
      closeForumTopic: vi.fn(),
    };

    await expect(
      finalizeSubagentTopic(api as never, "child-1", "completed", "Inspect sync"),
    ).resolves.toBe(true);
    expect(api.editForumTopic).not.toHaveBeenCalled();
    expect(api.closeForumTopic).not.toHaveBeenCalled();
  });

  it("detects ephemeral scopes", () => {
    mocked.bindingsBySession.set("child-1", { sessionId: "child-1", scopeKey: "chat:-100:10" });
    mocked.bindingsBySession.get("child-1").ephemeral = true;

    expect(isEphemeralTopicScope("chat:-100:10")).toBe(true);
    expect(isEphemeralTopicScope("chat:-100:7")).toBe(false);
  });
});
