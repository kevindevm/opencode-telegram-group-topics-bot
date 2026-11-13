import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "grammy";
import { openSessionInNewTopic } from "../../../src/bot/commands/sessions.js";
import { RateLimitExceededError } from "../../../src/bot/telegram-rate-limiter.js";
import {
  __resetSettingsForTests,
  TOPIC_SESSION_STATUS,
} from "../../../src/settings/manager.js";
import {
  __resetTopicManagerForTests,
  getTopicBindingBySessionId,
  registerTopicSessionBinding,
} from "../../../src/topic/manager.js";
import { t } from "../../../src/i18n/index.js";

const mocked = vi.hoisted(() => ({
  agentsMock: vi.fn(),
  providersMock: vi.fn(),
  messagesMock: vi.fn(),
  getMock: vi.fn(),
  diffMock: vi.fn(),
}));

vi.mock("../../../src/opencode/client.js", () => ({
  opencodeClient: {
    app: { agents: mocked.agentsMock },
    config: { providers: mocked.providersMock },
    session: {
      messages: mocked.messagesMock,
      get: mocked.getMock,
      diff: mocked.diffMock,
    },
  },
}));

vi.mock("../../../src/utils/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const CHAT_ID = -1000777;
const GENERAL_SCOPE_KEY = "chat:-1000777";
const PROJECT = { id: "p1", worktree: "/repo/a" };

function createCtx(overrides: {
  sendMessage?: ReturnType<typeof vi.fn>;
  createForumTopic?: ReturnType<typeof vi.fn>;
}): {
  ctx: Context;
  mocks: {
    answerCallbackQuery: ReturnType<typeof vi.fn>;
    reply: ReturnType<typeof vi.fn>;
    deleteMessage: ReturnType<typeof vi.fn>;
    sendMessage: ReturnType<typeof vi.fn>;
    createForumTopic: ReturnType<typeof vi.fn>;
  };
} {
  const sendMessage = overrides.sendMessage ?? vi.fn().mockResolvedValue({ message_id: 1 });
  const createForumTopic =
    overrides.createForumTopic ?? vi.fn().mockResolvedValue({ message_thread_id: 77 });
  const answerCallbackQuery = vi.fn().mockResolvedValue(undefined);
  const reply = vi.fn().mockResolvedValue(undefined);
  const deleteMessage = vi.fn().mockResolvedValue(undefined);
  const ctx = {
    chat: { id: CHAT_ID, type: "supergroup", is_forum: true },
    message: { message_thread_id: 1 },
    callbackQuery: {
      data: "session:ses-x",
      message: { message_id: 9, message_thread_id: 1 },
    },
    answerCallbackQuery,
    reply,
    deleteMessage,
    api: {
      sendMessage,
      createForumTopic,
      pinChatMessage: vi.fn().mockResolvedValue(true),
      deleteMessage: vi.fn().mockResolvedValue(true),
      editMessageText: vi.fn().mockResolvedValue(true),
      unpinChatMessage: vi.fn().mockResolvedValue(true),
    },
  } as unknown as Context;
  return { ctx, mocks: { answerCallbackQuery, reply, deleteMessage, sendMessage, createForumTopic } };
}

function registerBinding(sessionId: string, threadId: number): void {
  registerTopicSessionBinding({
    scopeKey: `${CHAT_ID}:${threadId}`,
    chatId: CHAT_ID,
    threadId,
    sessionId,
    projectId: PROJECT.id,
    projectWorktree: PROJECT.worktree,
    topicName: `Topic for ${sessionId}`,
    status: TOPIC_SESSION_STATUS.ACTIVE,
  });
}

describe("bot/commands/sessions existing-topic probe", () => {
  beforeEach(() => {
    __resetSettingsForTests();
    __resetTopicManagerForTests();
    mocked.agentsMock.mockReset();
    mocked.providersMock.mockReset();
    mocked.messagesMock.mockReset();
    mocked.getMock.mockReset();
    mocked.diffMock.mockReset();
    mocked.agentsMock.mockResolvedValue({ data: [], error: null });
    mocked.providersMock.mockResolvedValue({ data: { providers: [] }, error: null });
    mocked.messagesMock.mockResolvedValue({ data: [], error: null });
    mocked.getMock.mockResolvedValue({ data: null, error: null });
    mocked.diffMock.mockResolvedValue({ data: [], error: null });
  });

  it("keeps the binding and asks to retry when the probe is rate limited", async () => {
    registerBinding("ses-rate", 55);
    const { ctx, mocks } = createCtx({
      sendMessage: vi.fn().mockRejectedValue({ parameters: { retry_after: 1 } }),
    });

    const handled = await openSessionInNewTopic(
      ctx,
      { id: "ses-rate", title: "Rate session", model: null, agent: null },
      PROJECT,
      GENERAL_SCOPE_KEY,
      { threadId: 1 },
    );

    expect(handled).toBe(true);
    expect(mocks.createForumTopic).not.toHaveBeenCalled();
    expect(getTopicBindingBySessionId("ses-rate")).toBeDefined();
    expect(mocks.reply).toHaveBeenCalledTimes(1);
    expect(String(mocks.reply.mock.calls[0]?.[0])).toMatch(/rate limit/i);
  });

  it("keeps the binding on RateLimitExceededError exhaustion too", async () => {
    registerBinding("ses-exhausted", 56);
    const { ctx, mocks } = createCtx({
      sendMessage: vi.fn().mockRejectedValue(new RateLimitExceededError("sendMessage")),
    });

    const handled = await openSessionInNewTopic(
      ctx,
      { id: "ses-exhausted", title: "Exhausted session", model: null, agent: null },
      PROJECT,
      GENERAL_SCOPE_KEY,
      { threadId: 1 },
    );

    expect(handled).toBe(true);
    expect(mocks.createForumTopic).not.toHaveBeenCalled();
    expect(getTopicBindingBySessionId("ses-exhausted")).toBeDefined();
    expect(String(mocks.reply.mock.calls[0]?.[0])).toMatch(/rate limit/i);
  });

  it("recreates the topic only when the probe proves it is gone", async () => {
    registerBinding("ses-gone", 57);
    const { ctx, mocks } = createCtx({
      sendMessage: vi
        .fn()
        .mockRejectedValueOnce(new Error("Bad Request: message thread not found"))
        .mockResolvedValue({ message_id: 301 }),
    });

    const handled = await openSessionInNewTopic(
      ctx,
      { id: "ses-gone", title: "Gone session", model: null, agent: null },
      PROJECT,
      GENERAL_SCOPE_KEY,
      { threadId: 1 },
    );

    expect(handled).toBe(true);
    expect(mocks.createForumTopic).toHaveBeenCalledTimes(1);
    // The stale binding is replaced by the fresh topic binding.
    expect(getTopicBindingBySessionId("ses-gone")?.threadId).toBe(77);
  });

  it("keeps the binding and surfaces an error on unknown probe failures", async () => {
    registerBinding("ses-unknown", 58);
    const { ctx, mocks } = createCtx({
      sendMessage: vi.fn().mockRejectedValue(new Error("Something broke")),
    });

    const handled = await openSessionInNewTopic(
      ctx,
      { id: "ses-unknown", title: "Unknown session", model: null, agent: null },
      PROJECT,
      GENERAL_SCOPE_KEY,
      { threadId: 1 },
    );

    expect(handled).toBe(true);
    expect(mocks.createForumTopic).not.toHaveBeenCalled();
    expect(getTopicBindingBySessionId("ses-unknown")?.threadId).toBe(58);
    expect(mocks.reply).toHaveBeenCalledWith(t("sessions.select_error"), expect.anything());
  });

  it("reports rate limits from topic creation without creating a duplicate", async () => {
    const { ctx, mocks } = createCtx({
      createForumTopic: vi
        .fn()
        .mockRejectedValue(new RateLimitExceededError("createForumTopic")),
    });

    const handled = await openSessionInNewTopic(
      ctx,
      { id: "ses-create-429", title: "Fresh session", model: null, agent: null },
      PROJECT,
      GENERAL_SCOPE_KEY,
      { threadId: 1 },
    );

    expect(handled).toBe(true);
    expect(mocks.createForumTopic).toHaveBeenCalledTimes(1);
    expect(getTopicBindingBySessionId("ses-create-429")).toBeUndefined();
    expect(String(mocks.reply.mock.calls[0]?.[0])).toMatch(/rate limit/i);
  });
});
