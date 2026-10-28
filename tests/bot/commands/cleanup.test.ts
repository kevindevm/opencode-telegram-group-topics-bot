import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "grammy";

const mocked = vi.hoisted(() => ({
  listBindingsMock: vi.fn(),
  removeBindingMock: vi.fn(),
  statusMock: vi.fn(),
  abortMock: vi.fn(),
  clearKeyboardMock: vi.fn(),
  clearPinnedMock: vi.fn(),
}));

vi.mock("../../../src/topic/manager.js", () => ({
  listAllTopicBindings: mocked.listBindingsMock,
  removeTopicBinding: mocked.removeBindingMock,
}));

vi.mock("../../../src/opencode/client.js", () => ({
  opencodeClient: {
    session: {
      status: mocked.statusMock,
      abort: mocked.abortMock,
    },
  },
}));

vi.mock("../../../src/keyboard/manager.js", () => ({
  keyboardManager: { clearScope: mocked.clearKeyboardMock },
}));

vi.mock("../../../src/pinned/manager.js", () => ({
  pinnedMessageManager: { clear: mocked.clearPinnedMock },
}));

vi.mock("../../../src/bot/scope.js", () => ({
  getScopeFromContext: (ctx: unknown) => {
    const chat = (ctx as { chat?: { id?: number; type?: string } })?.chat;
    if (chat?.type === "private") {
      return { key: `dm:${chat.id}`, threadId: null };
    }
    return { key: "chat:-100123:1", threadId: 1 };
  },
  getThreadSendOptions: (threadId: number | null) =>
    threadId === null ? {} : { message_thread_id: threadId },
}));

import { cleanupCommand } from "../../../src/bot/commands/cleanup.js";
import { t } from "../../../src/i18n/index.js";

function createCommandContext(): Context {
  return {
    chat: { id: -100123, type: "supergroup" },
    reply: vi.fn().mockResolvedValue(undefined),
    api: {
      deleteForumTopic: vi.fn().mockResolvedValue(true),
    },
  } as unknown as Context;
}

function ephemeralBinding(overrides: Record<string, unknown> = {}) {
  return {
    scopeKey: "chat:-100123:10",
    chatId: -100123,
    threadId: 10,
    sessionId: "child-1",
    projectId: "p1",
    projectWorktree: "/repo/a",
    topicName: "🧩 Subagente",
    status: "active",
    ephemeral: true as const,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("bot/commands/cleanup", () => {
  beforeEach(() => {
    mocked.listBindingsMock.mockReset();
    mocked.removeBindingMock.mockReset();
    mocked.statusMock.mockReset().mockResolvedValue({ data: {}, error: null });
    mocked.abortMock.mockReset().mockResolvedValue({ data: true, error: null });
    mocked.clearKeyboardMock.mockReset();
    mocked.clearPinnedMock.mockReset().mockResolvedValue(undefined);
  });

  it("refuses to run in DM", async () => {
    const ctx = {
      chat: { id: 555, type: "private" },
      reply: vi.fn().mockResolvedValue(undefined),
    } as unknown as Context;

    await cleanupCommand(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith(t("cleanup.requires_forum_general"), {});
    expect(mocked.listBindingsMock).not.toHaveBeenCalled();
  });

  it("reports when there are no subagent topics", async () => {
    mocked.listBindingsMock.mockReturnValue([]);
    const ctx = createCommandContext();

    await cleanupCommand(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith(t("cleanup.subagents_none"), {
      message_thread_id: 1,
    });
  });

  it("aborts running sessions, deletes only ephemeral topics of this chat", async () => {
    mocked.listBindingsMock.mockReturnValue([
      ephemeralBinding({ scopeKey: "chat:-100123:10", threadId: 10, sessionId: "child-busy" }),
      ephemeralBinding({
        scopeKey: "chat:-100123:11",
        threadId: 11,
        sessionId: "child-idle",
        projectWorktree: "/repo/b",
      }),
      ephemeralBinding({
        scopeKey: "chat:-999:20",
        chatId: -999,
        threadId: 20,
        sessionId: "child-other-chat",
      }),
      {
        scopeKey: "chat:-100123:30",
        chatId: -100123,
        threadId: 30,
        sessionId: "regular-session",
        projectId: "p1",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    mocked.statusMock.mockImplementation(async ({ directory }: { directory: string }) => ({
      data:
        directory === "/repo/a"
          ? { "child-busy": { type: "busy" } }
          : { "child-idle": { type: "idle" } },
      error: null,
    }));
    const ctx = createCommandContext();

    await cleanupCommand(ctx as never);

    expect(mocked.abortMock).toHaveBeenCalledTimes(1);
    expect(mocked.abortMock).toHaveBeenCalledWith({
      sessionID: "child-busy",
      directory: "/repo/a",
    });
    const deleteForumTopic = ctx.api.deleteForumTopic as ReturnType<typeof vi.fn>;
    expect(deleteForumTopic).toHaveBeenCalledTimes(2);
    expect(deleteForumTopic).toHaveBeenCalledWith(-100123, 10);
    expect(deleteForumTopic).toHaveBeenCalledWith(-100123, 11);
    expect(mocked.removeBindingMock).toHaveBeenCalledWith(-100123, 10);
    expect(mocked.removeBindingMock).toHaveBeenCalledWith(-100123, 11);
    expect(mocked.clearKeyboardMock).toHaveBeenCalledWith("chat:-100123:10");
    expect(ctx.reply).toHaveBeenCalledWith(t("cleanup.subagents_result", { deleted: 2, failed: 0 }), {
      message_thread_id: 1,
    });
  });

  it("counts failures and keeps deleting the rest", async () => {
    mocked.listBindingsMock.mockReturnValue([
      ephemeralBinding({ scopeKey: "chat:-100123:10", threadId: 10, sessionId: "child-1" }),
      ephemeralBinding({ scopeKey: "chat:-100123:11", threadId: 11, sessionId: "child-2" }),
    ]);
    const ctx = createCommandContext();
    (ctx.api.deleteForumTopic as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Forbidden: not admin"),
    );

    await cleanupCommand(ctx as never);

    expect(mocked.removeBindingMock).toHaveBeenCalledTimes(1);
    expect(mocked.removeBindingMock).toHaveBeenCalledWith(-100123, 11);
    expect(ctx.reply).toHaveBeenCalledWith(t("cleanup.subagents_result", { deleted: 1, failed: 1 }), {
      message_thread_id: 1,
    });
  });
});
