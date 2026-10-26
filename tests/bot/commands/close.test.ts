import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "grammy";

const mocked = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  getBindingMock: vi.fn(),
  updateStatusMock: vi.fn(),
  clearPinnedMock: vi.fn(),
  abortMock: vi.fn(),
}));

vi.mock("../../../src/session/manager.js", () => ({
  getCurrentSession: mocked.getSessionMock,
}));

vi.mock("../../../src/topic/manager.js", () => ({
  getTopicBindingBySessionId: mocked.getBindingMock,
}));

vi.mock("../../../src/settings/manager.js", () => ({
  TOPIC_SESSION_STATUS: { ACTIVE: "active", CLOSED: "closed" },
  updateTopicSessionBindingStatus: mocked.updateStatusMock,
}));

vi.mock("../../../src/pinned/manager.js", () => ({
  pinnedMessageManager: { clear: mocked.clearPinnedMock },
}));

vi.mock("../../../src/bot/commands/abort.js", () => ({
  abortCurrentOperation: mocked.abortMock,
}));

vi.mock("../../../src/bot/scope.js", () => ({
  getScopeFromContext: () => ({ key: "scope-1", threadId: 9 }),
  getThreadSendOptions: (threadId: number | null) =>
    threadId === null ? {} : { message_thread_id: threadId },
}));

import { closeCommand } from "../../../src/bot/commands/close.js";
import { t } from "../../../src/i18n/index.js";

function createCommandContext(): Context {
  return {
    chat: { id: -100123, type: "supergroup" },
    reply: vi.fn().mockResolvedValue(undefined),
    api: {
      editForumTopic: vi.fn().mockResolvedValue(true),
    },
  } as unknown as Context;
}

describe("bot/commands/close", () => {
  beforeEach(() => {
    mocked.getSessionMock.mockReset().mockReturnValue({
      id: "session-1",
      title: "Session",
      directory: "/repo/app",
    });
    mocked.getBindingMock.mockReset().mockReturnValue({
      scopeKey: "scope-1",
      chatId: -100123,
      threadId: 9,
      sessionId: "session-1",
      topicName: "My topic",
      status: "active",
    });
    mocked.updateStatusMock.mockReset();
    mocked.clearPinnedMock.mockReset().mockResolvedValue(undefined);
    mocked.abortMock.mockReset().mockResolvedValue(undefined);
  });

  it("closes the topic session end to end", async () => {
    const ctx = createCommandContext();

    await closeCommand(ctx as never);

    expect(mocked.abortMock).toHaveBeenCalled();
    expect(mocked.updateStatusMock).toHaveBeenCalledWith("-100123:9", "closed");
    expect(mocked.clearPinnedMock).toHaveBeenCalledWith("scope-1");
    expect(ctx.api.editForumTopic).toHaveBeenCalledWith(
      -100123,
      9,
      expect.objectContaining({ name: expect.stringContaining("My topic") }),
    );
    expect(ctx.reply).toHaveBeenCalledWith(t("close.done", { title: "Session" }), {
      message_thread_id: 9,
    });
  });

  it("reports when there is no topic session", async () => {
    mocked.getSessionMock.mockReturnValue(undefined);
    const ctx = createCommandContext();

    await closeCommand(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith(t("close.no_topic_session"), { message_thread_id: 9 });
    expect(mocked.abortMock).not.toHaveBeenCalled();
  });
});
