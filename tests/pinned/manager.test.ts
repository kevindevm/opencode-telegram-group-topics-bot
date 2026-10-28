import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pinnedMessageManager } from "../../src/pinned/manager.js";
import {
  __resetSettingsForTests,
  setCurrentProject,
  setCurrentModel,
} from "../../src/settings/manager.js";

const opencodeMocks = vi.hoisted(() => ({
  providers: vi.fn(),
  diff: vi.fn(),
  get: vi.fn(),
  messages: vi.fn(),
}));

vi.mock("../../src/opencode/client.js", () => ({
  opencodeClient: {
    config: {
      providers: opencodeMocks.providers,
    },
    session: {
      diff: opencodeMocks.diff,
      get: opencodeMocks.get,
      messages: opencodeMocks.messages,
    },
  },
}));

function createApi() {
  let nextId = 100;
  return {
    sendMessage: vi.fn().mockImplementation(async () => ({ message_id: nextId++ })),
    pinChatMessage: vi.fn().mockResolvedValue(true),
    editMessageText: vi.fn().mockResolvedValue(true),
    unpinChatMessage: vi.fn().mockResolvedValue(true),
    deleteMessage: vi.fn().mockResolvedValue(true),
  };
}

describe("pinned manager scoped state", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map(async (dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  beforeEach(() => {
    __resetSettingsForTests();
    (pinnedMessageManager as unknown as { contexts: Map<string, unknown> }).contexts = new Map();
    opencodeMocks.providers.mockReset();
    opencodeMocks.diff.mockReset();
    opencodeMocks.get.mockReset();
    opencodeMocks.messages.mockReset();
    opencodeMocks.providers.mockResolvedValue({
      data: {
        providers: [
          {
            id: "openai",
            models: {
              "gpt-5": { limit: { context: 400000 } },
            },
          },
        ],
      },
      error: null,
    });
    opencodeMocks.diff.mockResolvedValue({ data: [], error: null });
    opencodeMocks.get.mockResolvedValue({ data: null, error: null });
    opencodeMocks.messages.mockResolvedValue({ data: [], error: null });
  });

  it("creates separate pinned messages for different thread scopes", async () => {
    const api = createApi();

    setCurrentProject({ id: "p1", worktree: "/repo/a" }, "chat:-1:10");
    setCurrentModel({ providerID: "openai", modelID: "gpt-5", variant: "default" }, "chat:-1:10");
    setCurrentProject({ id: "p2", worktree: "/repo/b" }, "chat:-1:20");
    setCurrentModel({ providerID: "openai", modelID: "gpt-5", variant: "default" }, "chat:-1:20");

    pinnedMessageManager.initialize(api as never, -1, "chat:-1:10", 10);
    pinnedMessageManager.initialize(api as never, -1, "chat:-1:20", 20);

    await pinnedMessageManager.onSessionChange("s1", "thread 10", "chat:-1:10");
    await pinnedMessageManager.onSessionChange("s2", "thread 20", "chat:-1:20");

    expect(api.sendMessage).toHaveBeenCalledTimes(2);
    expect(api.sendMessage).toHaveBeenNthCalledWith(
      1,
      -1,
      expect.any(String),
      expect.objectContaining({ message_thread_id: 10 }),
    );
    expect(api.sendMessage).toHaveBeenNthCalledWith(
      2,
      -1,
      expect.any(String),
      expect.objectContaining({ message_thread_id: 20 }),
    );

    const stateA = pinnedMessageManager.getState("chat:-1:10");
    const stateB = pinnedMessageManager.getState("chat:-1:20");
    expect(stateA.messageId).not.toBeNull();
    expect(stateB.messageId).not.toBeNull();
    expect(stateA.messageId).not.toBe(stateB.messageId);
  });

  it("uses thread id from scope key when explicit thread id is missing", async () => {
    const api = createApi();

    setCurrentProject({ id: "p1", worktree: "/repo/a" }, "-1:77");
    setCurrentModel({ providerID: "openai", modelID: "gpt-5", variant: "default" }, "-1:77");

    pinnedMessageManager.initialize(api as never, -1, "-1:77", null);
    await pinnedMessageManager.onSessionChange("s1", "thread 77", "-1:77");

    expect(api.sendMessage).toHaveBeenCalledWith(
      -1,
      expect.any(String),
      expect.objectContaining({ message_thread_id: 77 }),
    );
  });

  it("loads assistant cost from history into the scoped pinned message", async () => {
    const api = createApi();

    setCurrentProject({ id: "p1", worktree: "/repo/a" }, "chat:-1:10");
    setCurrentModel({ providerID: "openai", modelID: "gpt-5", variant: "default" }, "chat:-1:10");
    opencodeMocks.messages.mockResolvedValue({
      data: [
        {
          info: {
            role: "assistant",
            cost: 0.01234,
            tokens: { input: 1200, cache: { read: 300 } },
          },
        },
        {
          info: {
            role: "assistant",
            cost: 0.00056,
            tokens: { input: 900, cache: { read: 25 } },
          },
        },
      ],
      error: null,
    });

    pinnedMessageManager.initialize(api as never, -1, "chat:-1:10", 10);
    await pinnedMessageManager.onSessionChange("s1", "thread 10", "chat:-1:10");

    // History load only schedules the repaint; flush paints it.
    await pinnedMessageManager.flush("chat:-1:10");

    expect(api.sendMessage).toHaveBeenCalledWith(
      -1,
      expect.stringContaining("Cost: $0.00"),
      expect.objectContaining({ message_thread_id: 10 }),
    );
    expect(api.editMessageText).toHaveBeenCalledWith(
      -1,
      100,
      expect.stringContaining("Cost: $0.013"),
    );

    expect(pinnedMessageManager.getState("chat:-1:10")).toEqual(
      expect.objectContaining({
        assistantCost: 0.0129,
        tokensUsed: 1500,
      }),
    );
  });

  it("repaints with debounce after tokens and file changes, and exactly on flush", async () => {
    vi.useFakeTimers();
    try {
      const api = createApi();

      setCurrentProject({ id: "p1", worktree: "/repo/a" }, "chat:-1:10");
      setCurrentModel({ providerID: "openai", modelID: "gpt-5", variant: "default" }, "chat:-1:10");

      pinnedMessageManager.initialize(api as never, -1, "chat:-1:10", 10);
      await pinnedMessageManager.onSessionChange("s1", "thread 10", "chat:-1:10");
      api.editMessageText.mockClear();

      await pinnedMessageManager.onMessageComplete(
        { input: 100, output: 10, reasoning: 0, cacheRead: 20, cacheWrite: 0, cost: 0.01 },
        "chat:-1:10",
      );
      pinnedMessageManager.addFileChange(
        { file: "/repo/a/a.ts", additions: 1, deletions: 0 },
        "chat:-1:10",
      );

      // Nothing synchronous: the repaint is debounced.
      expect(api.editMessageText).not.toHaveBeenCalled();

      // Past both the debounce delay and the flood-control gap from a cold start.
      await vi.advanceTimersByTimeAsync(16_000);

      expect(api.editMessageText).toHaveBeenCalledTimes(1);
      expect(api.editMessageText).toHaveBeenCalledWith(
        -1,
        100,
        expect.stringContaining("Cost: $0.01"),
      );

      // Flush right after paints nothing new: identical render is skipped.
      await pinnedMessageManager.flush("chat:-1:10");
      expect(api.editMessageText).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("throttles bursts into one trailing edit with the latest state", async () => {
    vi.useFakeTimers();
    try {
      const api = createApi();

      setCurrentProject({ id: "p1", worktree: "/repo/a" }, "chat:-1:10");
      setCurrentModel({ providerID: "openai", modelID: "gpt-5", variant: "default" }, "chat:-1:10");

      pinnedMessageManager.initialize(api as never, -1, "chat:-1:10", 10);
      await pinnedMessageManager.onSessionChange("s1", "thread 10", "chat:-1:10");
      api.editMessageText.mockClear();

      await pinnedMessageManager.onMessageComplete(
        { input: 100, output: 10, reasoning: 0, cacheRead: 20, cacheWrite: 0, cost: 0.01 },
        "chat:-1:10",
      );
      await vi.advanceTimersByTimeAsync(16_000);
      expect(api.editMessageText).toHaveBeenCalledTimes(1);

      // A second completion right away is throttled, not dropped.
      await pinnedMessageManager.onMessageComplete(
        { input: 200, output: 10, reasoning: 0, cacheRead: 20, cacheWrite: 0, cost: 0.02 },
        "chat:-1:10",
      );
      expect(api.editMessageText).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(16_000);

      expect(api.editMessageText).toHaveBeenCalledTimes(2);
      expect(api.editMessageText).toHaveBeenLastCalledWith(
        -1,
        100,
        expect.stringContaining("Cost: $0.03"),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("schedules title, history and diff updates instead of editing immediately", async () => {
    vi.useFakeTimers();
    try {
      const api = createApi();

      setCurrentProject({ id: "p1", worktree: "/repo/a" }, "chat:-1:10");
      setCurrentModel({ providerID: "openai", modelID: "gpt-5", variant: "default" }, "chat:-1:10");

      pinnedMessageManager.initialize(api as never, -1, "chat:-1:10", 10);
      await pinnedMessageManager.onSessionChange("s1", "thread 10", "chat:-1:10");
      api.editMessageText.mockClear();

      // None of these may hit the Telegram API synchronously: bursts from
      // title updates, history loads and diffs collapse into one trailing
      // edit instead of a 429 storm.
      await pinnedMessageManager.onSessionTitleUpdate("new title", "chat:-1:10");
      await pinnedMessageManager.loadContextFromHistory("s1", "/repo/a", "chat:-1:10");
      await pinnedMessageManager.onSessionDiff(
        [{ file: "a.ts", additions: 1, deletions: 0 }],
        "chat:-1:10",
      );
      expect(api.editMessageText).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(16_000);
      expect(api.editMessageText).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("recreates the dashboard message when the tracked id is gone", async () => {    const api = createApi();

    setCurrentProject({ id: "p1", worktree: "/repo/a" }, "chat:-1:10");
    setCurrentModel({ providerID: "openai", modelID: "gpt-5", variant: "default" }, "chat:-1:10");

    pinnedMessageManager.initialize(api as never, -1, "chat:-1:10", 10);
    await pinnedMessageManager.onSessionChange("s1", "thread 10", "chat:-1:10");
    expect(pinnedMessageManager.getState("chat:-1:10").messageId).toBe(100);

    // Simulate a lost reference (deleted message, wiped state, restart gap).
    const contexts = (
      pinnedMessageManager as unknown as {
        contexts: Map<string, { state: { messageId: number | null } }>;
      }
    ).contexts;
    contexts.get("chat:-1:10")!.state.messageId = null;

    await pinnedMessageManager.flush("chat:-1:10");

    expect(api.sendMessage).toHaveBeenCalledTimes(2);
    expect(api.pinChatMessage).toHaveBeenCalledTimes(2);
    expect(pinnedMessageManager.getState("chat:-1:10").messageId).toBe(101);
  });

  it("recreates the dashboard when Telegram reports message to edit not found", async () => {
    const api = createApi();

    setCurrentProject({ id: "p1", worktree: "/repo/a" }, "chat:-1:10");
    setCurrentModel({ providerID: "openai", modelID: "gpt-5", variant: "default" }, "chat:-1:10");

    pinnedMessageManager.initialize(api as never, -1, "chat:-1:10", 10);
    await pinnedMessageManager.onSessionChange("s1", "thread 10", "chat:-1:10");
    api.sendMessage.mockClear();

    // Change state so the flush actually attempts an edit.
    await pinnedMessageManager.onMessageComplete(
      { input: 100, output: 10, reasoning: 0, cacheRead: 20, cacheWrite: 0, cost: 0.01 },
      "chat:-1:10",
    );
    api.editMessageText.mockRejectedValueOnce(
      new Error("Bad Request: message to edit not found"),
    );
    await pinnedMessageManager.flush("chat:-1:10");

    expect(api.sendMessage).toHaveBeenCalledTimes(1);
    expect(pinnedMessageManager.getState("chat:-1:10").messageId).toBe(101);
  });

  it("recreates the dashboard when Telegram refuses to edit it (48h window)", async () => {
    const api = createApi();

    setCurrentProject({ id: "p1", worktree: "/repo/a" }, "chat:-1:10");
    setCurrentModel({ providerID: "openai", modelID: "gpt-5", variant: "default" }, "chat:-1:10");

    pinnedMessageManager.initialize(api as never, -1, "chat:-1:10", 10);
    await pinnedMessageManager.onSessionChange("s1", "thread 10", "chat:-1:10");
    api.sendMessage.mockClear();

    await pinnedMessageManager.onMessageComplete(
      { input: 200, output: 10, reasoning: 0, cacheRead: 20, cacheWrite: 0, cost: 0.02 },
      "chat:-1:10",
    );
    api.editMessageText.mockRejectedValueOnce(
      new Error("Bad Request: message can't be edited"),
    );
    await pinnedMessageManager.flush("chat:-1:10");

    expect(api.sendMessage).toHaveBeenCalledTimes(1);
    expect(pinnedMessageManager.getState("chat:-1:10").messageId).toBe(101);
  });

  it("never pins a dashboard in the General control topic", async () => {
    const api = createApi();

    setCurrentProject({ id: "p1", worktree: "/repo/a" }, "chat:-1");
    setCurrentModel({ providerID: "openai", modelID: "gpt-5", variant: "default" }, "chat:-1");

    pinnedMessageManager.initialize(api as never, -1, "chat:-1", 1);
    await pinnedMessageManager.onSessionChange("s1", "thread 1", "chat:-1");
    await pinnedMessageManager.onMessageComplete(
      { input: 100, output: 10, reasoning: 0, cacheRead: 20, cacheWrite: 0, cost: 0.01 },
      "chat:-1",
    );
    await pinnedMessageManager.flush("chat:-1");

    expect(api.sendMessage).not.toHaveBeenCalled();
    expect(api.pinChatMessage).not.toHaveBeenCalled();
    expect(api.editMessageText).not.toHaveBeenCalled();
    expect(pinnedMessageManager.getState("chat:-1").messageId).toBeNull();
  });

  it("retires a legacy General dashboard message on initialize", async () => {
    const api = createApi();

    pinnedMessageManager.initialize(api as never, -1, "chat:-1", 1);
    const contexts = (
      pinnedMessageManager as unknown as {
        contexts: Map<string, { state: { messageId: number | null; sessionId: string | null } }>;
      }
    ).contexts;
    contexts.get("chat:-1")!.state.messageId = 100;
    contexts.get("chat:-1")!.state.sessionId = "s1";

    pinnedMessageManager.initialize(api as never, -1, "chat:-1", 1);
    // The retire runs fire-and-forget: let its awaits settle.
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(api.deleteMessage).toHaveBeenCalledWith(-1, 100);
    expect(api.pinChatMessage).not.toHaveBeenCalled();
    expect(pinnedMessageManager.getState("chat:-1").messageId).toBeNull();
  });

  it("does not resurrect a dashboard after clear until the session reopens", async () => {
    const api = createApi();

    setCurrentProject({ id: "p1", worktree: "/repo/a" }, "chat:-1:10");
    setCurrentModel({ providerID: "openai", modelID: "gpt-5", variant: "default" }, "chat:-1:10");

    pinnedMessageManager.initialize(api as never, -1, "chat:-1:10", 10);
    await pinnedMessageManager.onSessionChange("s1", "thread 10", "chat:-1:10");
    await pinnedMessageManager.clear("chat:-1:10");
    api.sendMessage.mockClear();
    api.editMessageText.mockClear();

    await pinnedMessageManager.flush("chat:-1:10");

    expect(api.sendMessage).not.toHaveBeenCalled();
    expect(api.editMessageText).not.toHaveBeenCalled();
    expect(pinnedMessageManager.getState("chat:-1:10").messageId).toBeNull();
  });

  it("paints a fresh dashboard on reopen and keeps editing that message", async () => {
    const api = createApi();

    setCurrentProject({ id: "p1", worktree: "/repo/a" }, "chat:-1:10");
    setCurrentModel({ providerID: "openai", modelID: "gpt-5", variant: "default" }, "chat:-1:10");

    pinnedMessageManager.initialize(api as never, -1, "chat:-1:10", 10);
    await pinnedMessageManager.onSessionChange("s1", "thread 10", "chat:-1:10");
    await pinnedMessageManager.clear("chat:-1:10");

    await pinnedMessageManager.onSessionChange("s2", "thread 10 reopened", "chat:-1:10");

    const reopenedId = pinnedMessageManager.getState("chat:-1:10").messageId;
    expect(reopenedId).not.toBeNull();
    expect(reopenedId).toBe(101);

    // New activity after reopen edits the new message, never the old one.
    pinnedMessageManager.addFileChange(
      { file: "/repo/a/b.ts", additions: 2, deletions: 0 },
      "chat:-1:10",
    );
    await pinnedMessageManager.flush("chat:-1:10");

    expect(api.editMessageText).toHaveBeenCalledWith(
      -1,
      reopenedId,
      expect.stringContaining("b.ts"),
    );
  });

  it("reloads context from history after compaction", async () => {
    const api = createApi();

    setCurrentProject({ id: "p1", worktree: "/repo/a" }, "chat:-1:10");
    setCurrentModel({ providerID: "openai", modelID: "gpt-5", variant: "default" }, "chat:-1:10");
    pinnedMessageManager.initialize(api as never, -1, "chat:-1:10", 10);
    await pinnedMessageManager.onSessionChange("s1", "thread 10", "chat:-1:10");

    opencodeMocks.messages.mockResolvedValueOnce({
      data: [
        {
          info: {
            role: "assistant",
            cost: 0.02,
            tokens: { input: 5000, cache: { read: 250 } },
          },
        },
      ],
      error: null,
    });

    await pinnedMessageManager.onSessionCompacted("s1", "/repo/a", "chat:-1:10");

    const state = pinnedMessageManager.getState("chat:-1:10");
    expect(state).toEqual(
      expect.objectContaining({
        tokensUsed: 5250,
        assistantCost: expect.closeTo(0.02, 5),
      }),
    );
  });

  it("includes summary messages when reloading context after compaction", async () => {
    const api = createApi();

    setCurrentProject({ id: "p1", worktree: "/repo/a" }, "chat:-1:10");
    setCurrentModel({ providerID: "openai", modelID: "gpt-5", variant: "default" }, "chat:-1:10");
    pinnedMessageManager.initialize(api as never, -1, "chat:-1:10", 10);
    await pinnedMessageManager.onSessionChange("s1", "thread 10", "chat:-1:10");

    opencodeMocks.messages.mockResolvedValueOnce({
      data: [
        {
          info: {
            role: "assistant",
            summary: true,
            cost: 0.005,
            tokens: { input: 800, cache: { read: 120 } },
          },
        },
      ],
      error: null,
    });

    await pinnedMessageManager.onSessionCompacted("s1", "/repo/a", "chat:-1:10");

    expect(pinnedMessageManager.getState("chat:-1:10")).toEqual(
      expect.objectContaining({
        tokensUsed: 920,
        assistantCost: expect.closeTo(0.005, 5),
      }),
    );
  });

  it("shows the git branch for linked worktree projects", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "pinned-manager-"));
    tempDirs.push(tempRoot);

    const repoDir = path.join(tempRoot, "repo");
    const gitDir = path.join(tempRoot, "git-meta", "worktrees", "repo");
    await mkdir(repoDir, { recursive: true });
    await mkdir(gitDir, { recursive: true });
    await writeFile(path.join(repoDir, ".git"), `gitdir: ${gitDir}`);
    await writeFile(path.join(gitDir, "HEAD"), "ref: refs/heads/feature/sync-test\n");

    const api = createApi();
    setCurrentProject({ id: "p1", worktree: repoDir }, "chat:-1:10");
    setCurrentModel({ providerID: "openai", modelID: "gpt-5", variant: "default" }, "chat:-1:10");

    pinnedMessageManager.initialize(api as never, -1, "chat:-1:10", 10);
    await pinnedMessageManager.onSessionChange("s1", "thread 10", "chat:-1:10");

    expect(api.sendMessage).toHaveBeenCalledWith(
      -1,
      expect.stringContaining("feature/sync-test"),
      expect.objectContaining({ message_thread_id: 10 }),
    );
    expect(pinnedMessageManager.getState("chat:-1:10")).toEqual(
      expect.objectContaining({ projectBranch: "feature/sync-test" }),
    );
  });

  it("clamps over-limit usage to the model limit instead of freezing the dashboard", async () => {
    const api = createApi();

    setCurrentProject({ id: "p1", worktree: "/repo/a" }, "chat:-1:10");
    setCurrentModel({ providerID: "openai", modelID: "gpt-5", variant: "default" }, "chat:-1:10");

    pinnedMessageManager.initialize(api as never, -1, "chat:-1:10", 10);
    await pinnedMessageManager.onSessionChange("s1", "thread 10", "chat:-1:10");

    // 500k window against a 400k limit: the dashboard must show 100%, not 125%.
    await pinnedMessageManager.onMessageComplete(
      { input: 450000, output: 10, reasoning: 0, cacheRead: 50000, cacheWrite: 0, cost: 0.01 },
      "chat:-1:10",
    );

    expect(pinnedMessageManager.getState("chat:-1:10")).toEqual(
      expect.objectContaining({ tokensUsed: 400000, tokensLimit: 400000 }),
    );
    const info = pinnedMessageManager.getContextInfo("chat:-1:10");
    expect(info).toEqual({ tokensUsed: 400000, tokensLimit: 400000 });
  });

  it("clears the file list when the session diff becomes empty", async () => {
    vi.useFakeTimers();
    try {
      const api = createApi();

      setCurrentProject({ id: "p1", worktree: "/repo/a" }, "chat:-1:10");
      setCurrentModel({ providerID: "openai", modelID: "gpt-5", variant: "default" }, "chat:-1:10");

      pinnedMessageManager.initialize(api as never, -1, "chat:-1:10", 10);
      await pinnedMessageManager.onSessionChange("s1", "thread 10", "chat:-1:10");
      pinnedMessageManager.addFileChange(
        { file: "/repo/a/stale.ts", additions: 3, deletions: 1 },
        "chat:-1:10",
      );
      // Paint the file entry first so clearing it is a visible change.
      await pinnedMessageManager.flush("chat:-1:10");
      expect(api.editMessageText).toHaveBeenLastCalledWith(
        -1,
        expect.any(Number),
        expect.stringContaining("stale.ts"),
      );
      api.editMessageText.mockClear();

      await pinnedMessageManager.onSessionDiff([], "chat:-1:10");
      expect(pinnedMessageManager.getState("chat:-1:10").changedFiles).toHaveLength(0);

      await vi.advanceTimersByTimeAsync(16_000);
      expect(api.editMessageText).toHaveBeenCalled();
      expect(api.editMessageText).toHaveBeenLastCalledWith(
        -1,
        expect.any(Number),
        expect.not.stringContaining("stale.ts"),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the history baseline when a live update reports a smaller window", async () => {
    const api = createApi();

    setCurrentProject({ id: "p1", worktree: "/repo/a" }, "chat:-1:10");
    setCurrentModel({ providerID: "openai", modelID: "gpt-5", variant: "default" }, "chat:-1:10");
    opencodeMocks.messages.mockResolvedValueOnce({
      data: [
        {
          info: {
            role: "assistant",
            cost: 0.02,
            tokens: { input: 4800, cache: { read: 200 } },
          },
        },
      ],
      error: null,
    });

    pinnedMessageManager.initialize(api as never, -1, "chat:-1:10", 10);
    await pinnedMessageManager.onSessionChange("s1", "thread 10", "chat:-1:10");
    expect(pinnedMessageManager.getState("chat:-1:10").tokensUsed).toBe(5000);

    // A later small live window must not move the dashboard backwards.
    await pinnedMessageManager.onMessageComplete(
      { input: 100, output: 5, reasoning: 0, cacheRead: 20, cacheWrite: 0, cost: 0.005 },
      "chat:-1:10",
    );

    expect(pinnedMessageManager.getState("chat:-1:10").tokensUsed).toBe(5000);
    expect(pinnedMessageManager.getState("chat:-1:10").assistantCost).toBeCloseTo(0.025, 5);
  });
});
