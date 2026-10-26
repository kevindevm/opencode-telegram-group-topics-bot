import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Bot, Context } from "grammy";
import {
  __resetQueuedPromptsForTests,
  __enqueuePromptRequestForTests,
  __enqueuePromptRequestForTests,
  activatePromptResponseMode,
  clearPromptResponseMode,
  clearQueuedPrompts,
  consumePromptResponseMode,
  dispatchNextQueuedPrompt,
  dispatchRestoredQueues,
  getPromptResponseMode,
  getQueuedPromptCountForTests,
  handleQueuedPromptCancel,
  handleQueuedPromptFront,
  handleQueuedPromptSteer,
  listQueuedPrompts,
  processUserPrompt,
  restoreQueuedPromptsFromSettings,
} from "../../../src/bot/handlers/prompt.js";
import { t } from "../../../src/i18n/index.js";

const mocked = vi.hoisted(() => ({
  getCurrentProjectMock: vi.fn(),
  isTtsEnabledMock: vi.fn(),
  getScheduledTaskTopicByChatAndThreadMock: vi.fn(),
  getCurrentSessionMock: vi.fn(),
  getStoredAgentMock: vi.fn(),
  getStoredModelMock: vi.fn(),
  getTopicBindingByScopeKeyMock: vi.fn(),
  safeBackgroundTaskMock: vi.fn(),
  sessionStatusMock: vi.fn(),
  sessionGetMock: vi.fn(),
  sessionPromptAsyncMock: vi.fn(),
  sessionAbortMock: vi.fn(),
  setCurrentModelMock: vi.fn(),
  serverVersion: "v2",
  probeMock: vi.fn(),
  persistedQueue: {} as Record<string, unknown[]>,
  setPersistedQueueMock: vi.fn(),
}));

vi.mock("../../../src/opencode/client.js", () => ({
  opencodeClient: {
    session: {
      status: mocked.sessionStatusMock,
      get: mocked.sessionGetMock,
      create: vi.fn(),
      promptAsync: mocked.sessionPromptAsyncMock,
      abort: mocked.sessionAbortMock,
    },
  },
  get opencodeServerVersion() {
    return mocked.serverVersion;
  },
  probeOpencodeServer: mocked.probeMock,
}));

vi.mock("../../../src/session/manager.js", () => ({
  clearSession: vi.fn(),
  getCurrentSession: mocked.getCurrentSessionMock,
  setCurrentSession: vi.fn(),
}));

vi.mock("../../../src/session/cache-manager.js", () => ({
  ingestSessionInfoForCache: vi.fn(),
  __resetSessionDirectoryCacheForTests: vi.fn(),
}));

vi.mock("../../../src/settings/manager.js", () => ({
  getCurrentProject: mocked.getCurrentProjectMock,
  isTtsEnabled: mocked.isTtsEnabledMock,
  setCurrentModel: mocked.setCurrentModelMock,
  getPersistedQueuedPrompts: () => mocked.persistedQueue,
  setPersistedQueuedPrompts: mocked.setPersistedQueueMock,
}));

vi.mock("../../../src/agent/manager.js", () => ({
  getStoredAgent: mocked.getStoredAgentMock,
  resolveProjectAgent: vi.fn(async (agent: string) => agent),
}));

vi.mock("../../../src/model/manager.js", () => ({
  getStoredModel: mocked.getStoredModelMock,
}));

vi.mock("../../../src/variant/manager.js", () => ({
  formatVariantForButton: vi.fn(),
}));

vi.mock("../../../src/bot/utils/keyboard.js", () => ({
  createMainKeyboard: vi.fn(),
}));

vi.mock("../../../src/keyboard/manager.js", () => ({
  keyboardManager: {
    initialize: vi.fn(),
    getContextInfo: vi.fn(),
  },
}));

vi.mock("../../../src/pinned/manager.js", () => ({
  pinnedMessageManager: {
    isInitialized: vi.fn(),
    initialize: vi.fn(),
    onSessionChange: vi.fn(),
    getContextLimit: vi.fn(),
    refreshContextLimit: vi.fn(),
    getContextInfo: vi.fn(),
    getState: vi.fn(() => ({ messageId: null })),
  },
}));

vi.mock("../../../src/summary/aggregator.js", () => ({
  summaryAggregator: {
    setSession: vi.fn(),
    clear: vi.fn(),
  },
}));

vi.mock("../../../src/interaction/manager.js", () => ({
  interactionManager: {
    getSnapshot: vi.fn(),
    clear: vi.fn(),
  },
}));

vi.mock("../../../src/interaction/cleanup.js", () => ({
  clearAllInteractionState: vi.fn(),
}));

vi.mock("../../../src/utils/safe-background-task.js", () => ({
  safeBackgroundTask: mocked.safeBackgroundTaskMock,
}));

vi.mock("../../../src/utils/error-format.js", () => ({
  formatErrorDetails: vi.fn(),
}));

vi.mock("../../../src/utils/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../../src/bot/scope.js", () => ({
  GLOBAL_SCOPE_KEY: "global",
  SCOPE_CONTEXT: {
    GROUP_TOPIC: "group-topic",
  },
  getScopeFromContext: vi.fn((ctx: Context) => ({
    key: "-100123:555",
    context: "group-topic",
    threadId: ctx.message?.message_thread_id ?? null,
  })),
  getThreadSendOptions: vi.fn((threadId: number | null) =>
    threadId === null ? {} : { message_thread_id: threadId },
  ),
}));

vi.mock("../../../src/bot/constants.js", () => ({
  BOT_I18N_KEY: {
    TOPIC_UNBOUND: "topic.unbound",
  },
  CHAT_TYPE: {
    PRIVATE: "private",
  },
}));

vi.mock("../../../src/interaction/constants.js", () => ({
  INTERACTION_CLEAR_REASON: {
    SESSION_MISMATCH_RESET: "session_mismatch_reset",
  },
}));

vi.mock("../../../src/topic/manager.js", () => ({
  getTopicBindingByScopeKey: mocked.getTopicBindingByScopeKeyMock,
}));

vi.mock("../../../src/scheduled-task/store.js", () => ({
  getScheduledTaskTopicByChatAndThread: mocked.getScheduledTaskTopicByChatAndThreadMock,
}));

function createContext(): Context {
  return {
    chat: {
      id: -100123,
      type: "supergroup",
    },
    message: {
      text: "Test",
      message_thread_id: 555,
    },
    reply: vi.fn().mockResolvedValue(undefined),
  } as unknown as Context;
}

describe("bot/handlers/prompt", () => {
  beforeEach(() => {
    __resetQueuedPromptsForTests();
    mocked.getCurrentProjectMock.mockReset();
    mocked.isTtsEnabledMock.mockReset();
    mocked.getScheduledTaskTopicByChatAndThreadMock.mockReset();
    mocked.getCurrentSessionMock.mockReset();
    mocked.getStoredAgentMock.mockReset();
    mocked.getStoredModelMock.mockReset();
    mocked.getTopicBindingByScopeKeyMock.mockReset();
    mocked.safeBackgroundTaskMock.mockReset();
    mocked.sessionStatusMock.mockReset();
    mocked.sessionGetMock.mockReset();
    mocked.sessionPromptAsyncMock.mockReset();
    mocked.sessionAbortMock.mockReset();
    mocked.probeMock.mockReset().mockResolvedValue({ kind: "none" });
    mocked.setPersistedQueueMock.mockReset();
    mocked.persistedQueue = {};
    mocked.setCurrentModelMock.mockReset();

    process.env.OPENCODE_MODEL_PROVIDER = "opencode";
    process.env.OPENCODE_MODEL_ID = "big-pickle";

    mocked.getCurrentProjectMock.mockReturnValue({ id: "project-1", worktree: "/repo/app" });
    mocked.isTtsEnabledMock.mockReturnValue(false);
    mocked.getCurrentSessionMock.mockReturnValue({
      id: "session-1",
      title: "Session",
      directory: "/repo/app",
    });
    mocked.getStoredAgentMock.mockReturnValue("builder");
    mocked.getStoredModelMock.mockReturnValue({
      providerID: "openai",
      modelID: "gpt-5",
      variant: "fast",
    });
    mocked.getTopicBindingByScopeKeyMock.mockReturnValue({ sessionId: "session-1" });
    mocked.sessionStatusMock.mockResolvedValue({
      data: { "session-1": { type: "idle" } },
      error: null,
    });
    mocked.sessionGetMock.mockResolvedValue({
      data: {
        id: "session-1",
        title: "Session",
        model: { providerID: "openai", id: "gpt-5", variant: "fast" },
      },
      error: null,
    });
    mocked.sessionPromptAsyncMock.mockResolvedValue({ error: null });
    mocked.safeBackgroundTaskMock.mockImplementation(
      async ({
        task,
        onSuccess,
        onError,
      }: {
        task: () => Promise<unknown>;
        onSuccess?: (value: unknown) => void | Promise<void>;
        onError?: (error: unknown) => void | Promise<void>;
      }) => {
        try {
          const value = await task();
          if (onSuccess) {
            await onSuccess(value);
          }
        } catch (error) {
          if (onError) {
            await onError(error);
          }
        }
      },
    );
  });

  it("blocks prompt text in scheduled task output topics with better guidance", async () => {
    mocked.getScheduledTaskTopicByChatAndThreadMock.mockResolvedValue({
      chatId: -100123,
      projectId: "project-1",
      projectWorktree: "/repo/app",
      threadId: 555,
      topicName: "⏰ Scheduled Task Output",
      createdAt: "2026-03-26T00:00:00.000Z",
      updatedAt: "2026-03-26T00:00:00.000Z",
    });

    const ctx = createContext();
    const result = await processUserPrompt(ctx, "Test", {
      bot: {} as Bot<Context>,
      ensureEventSubscription: vi.fn(),
    });

    expect(result).toBe(false);
    expect(ctx.reply).toHaveBeenCalledWith(t("task.output_topic_blocked"), {
      message_thread_id: 555,
    });
    expect(mocked.getCurrentProjectMock).not.toHaveBeenCalled();
  });

  it("queues prompts while the current session is busy and dispatches them on idle", async () => {
    mocked.getScheduledTaskTopicByChatAndThreadMock.mockResolvedValue(null);
    mocked.sessionStatusMock.mockResolvedValueOnce({
      data: { "session-1": { type: "busy" } },
      error: null,
    });

    const ctx = createContext();
    const bot = {
      api: {
        sendMessage: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as Bot<Context>;

    const result = await processUserPrompt(
      ctx,
      "Test",
      {
        bot,
        ensureEventSubscription: vi.fn(),
      },
      [],
      { responseMode: "text_and_tts" },
    );

    expect(result).toBe(true);
    expect(ctx.reply).toHaveBeenCalledWith(
      t("bot.session_queued", { position: "1" }),
      expect.objectContaining({ reply_markup: expect.anything() }),
    );
    expect(mocked.sessionPromptAsyncMock).not.toHaveBeenCalled();

    mocked.sessionStatusMock.mockResolvedValueOnce({
      data: { "session-1": { type: "idle" } },
      error: null,
    });

    const dispatched = await dispatchNextQueuedPrompt("session-1");

    expect(dispatched).toBe(true);
    expect(bot.api.sendMessage).toHaveBeenCalledWith(
      -100123,
      t("bot.session_queue_started", { preview: "Test" }),
      { message_thread_id: 555 },
    );
    expect(mocked.sessionPromptAsyncMock).toHaveBeenCalledWith({
      sessionID: "session-1",
      directory: "/repo/app",
      parts: [{ type: "text", text: "Test" }],
      agent: "builder",
      model: { providerID: "openai", modelID: "gpt-5" },
      variant: "fast",
    });
    expect(consumePromptResponseMode("session-1")).toBe("text_and_tts");
  });

  it("uses TTS response mode by default when the scope setting is enabled", async () => {
    mocked.getScheduledTaskTopicByChatAndThreadMock.mockResolvedValue(null);
    mocked.isTtsEnabledMock.mockReturnValue(true);

    const ctx = createContext();

    await processUserPrompt(ctx, "Test", {
      bot: {} as Bot<Context>,
      ensureEventSubscription: vi.fn(),
    });

    expect(consumePromptResponseMode("session-1")).toBe("text_and_tts");
    expect(mocked.isTtsEnabledMock).toHaveBeenCalledWith();
  });

  it("keeps the live model of an existing session when scope still has the configured default", async () => {
    mocked.getScheduledTaskTopicByChatAndThreadMock.mockResolvedValue(null);
    mocked.getStoredModelMock.mockReturnValue({
      providerID: "opencode",
      modelID: "big-pickle",
      variant: "default",
    });
    mocked.sessionGetMock.mockResolvedValueOnce({
      data: {
        id: "session-1",
        title: "Session",
        model: { providerID: "openai", id: "gpt-5.5", variant: "default" },
      },
      error: null,
    });

    const ctx = createContext();

    await processUserPrompt(ctx, "Test", {
      bot: {} as Bot<Context>,
      ensureEventSubscription: vi.fn(),
    });

    expect(mocked.setCurrentModelMock).toHaveBeenCalledWith(
      { providerID: "openai", modelID: "gpt-5.5", variant: "default" },
      "-100123:555",
    );
    expect(mocked.sessionPromptAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { providerID: "openai", modelID: "gpt-5.5" },
        variant: "default",
      }),
    );
  });

  it("attaches a cancel button to the queued notice with the queue id", async () => {
    mocked.getScheduledTaskTopicByChatAndThreadMock.mockResolvedValue(null);
    mocked.sessionStatusMock.mockResolvedValueOnce({
      data: { "session-1": { type: "busy" } },
      error: null,
    });

    const ctx = createContext();

    await processUserPrompt(
      ctx,
      "Please cancel me",
      {
        bot: {} as Bot<Context>,
        ensureEventSubscription: vi.fn(),
      },
      [],
      { responseMode: "text_only" },
    );

    const replyMarkup = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]
      ?.reply_markup as { inline_keyboard?: Array<Array<{ callback_data?: string }>> };
    const callbackData =
      replyMarkup?.inline_keyboard
        ?.flat()
        .map((button) => button.callback_data ?? "")
        .find((data) => data.startsWith("queue:cancel:")) ?? "";
    expect(callbackData.startsWith("queue:cancel:")).toBe(true);

    const queueId = callbackData.slice("queue:cancel:".length);
    expect(queueId.length).toBeGreaterThan(0);
    expect(getQueuedPromptCountForTests("session-1")).toBe(1);
  });

  it("cancels a queued prompt from its button and edits the notice", async () => {
    mocked.getScheduledTaskTopicByChatAndThreadMock.mockResolvedValue(null);
    mocked.sessionStatusMock.mockResolvedValueOnce({
      data: { "session-1": { type: "busy" } },
      error: null,
    });

    const ctx = createContext();
    await processUserPrompt(ctx, "Regret this", {
      bot: {} as Bot<Context>,
      ensureEventSubscription: vi.fn(),
    });

    const replyMarkup = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]
      ?.reply_markup as { inline_keyboard?: Array<Array<{ callback_data?: string }>> };
    const callbackData =
      replyMarkup?.inline_keyboard
        ?.flat()
        .map((button) => button.callback_data ?? "")
        .find((data) => data.startsWith("queue:cancel:")) as string;

    const cancelCtx = {
      callbackQuery: { data: callbackData },
      answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
      editMessageText: vi.fn().mockResolvedValue(undefined),
    } as unknown as Context;

    const handled = await handleQueuedPromptCancel(cancelCtx);

    expect(handled).toBe(true);
    expect(getQueuedPromptCountForTests("session-1")).toBe(0);
    expect(cancelCtx.answerCallbackQuery).toHaveBeenCalledWith({
      text: t("bot.session_queue_cancelled_callback"),
    });
    expect(cancelCtx.editMessageText).toHaveBeenCalledWith(
      t("bot.session_queue_cancelled", { preview: "Regret this" }),
    );

    const dispatched = await dispatchNextQueuedPrompt("session-1");
    expect(dispatched).toBe(false);
    expect(mocked.sessionPromptAsyncMock).not.toHaveBeenCalled();
  });

  it("keeps the remaining queue when cancelling one of two prompts", async () => {
    mocked.getScheduledTaskTopicByChatAndThreadMock.mockResolvedValue(null);
    mocked.sessionStatusMock.mockResolvedValue({
      data: { "session-1": { type: "busy" } },
      error: null,
    });

    const bot = {
      api: { sendMessage: vi.fn().mockResolvedValue(undefined) },
    } as unknown as Bot<Context>;

    const firstCtx = createContext();
    await processUserPrompt(firstCtx, "First", {
      bot,
      ensureEventSubscription: vi.fn(),
    });
    const secondCtx = createContext();
    await processUserPrompt(secondCtx, "Second", {
      bot,
      ensureEventSubscription: vi.fn(),
    });
    expect(getQueuedPromptCountForTests("session-1")).toBe(2);

    const firstMarkup = (firstCtx.reply as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]
      ?.reply_markup as { inline_keyboard?: Array<Array<{ callback_data?: string }>> };
    const firstCallback = firstMarkup?.inline_keyboard
      ?.flat()
      .map((button) => button.callback_data ?? "")
      .find((data) => data.startsWith("queue:cancel:")) as string;

    const cancelCtx = {
      callbackQuery: { data: firstCallback },
      answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
      editMessageText: vi.fn().mockResolvedValue(undefined),
    } as unknown as Context;

    expect(await handleQueuedPromptCancel(cancelCtx)).toBe(true);
    expect(getQueuedPromptCountForTests("session-1")).toBe(1);

    mocked.sessionStatusMock.mockResolvedValueOnce({
      data: { "session-1": { type: "idle" } },
      error: null,
    });
    const dispatched = await dispatchNextQueuedPrompt("session-1");
    expect(dispatched).toBe(true);
    expect(mocked.sessionPromptAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({ parts: [{ type: "text", text: "Second" }] }),
    );
  });

  it("answers missing when the queued prompt already started", async () => {
    const cancelCtx = {
      callbackQuery: { data: "queue:cancel:does-not-exist" },
      answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
      editMessageText: vi.fn(),
    } as unknown as Context;

    expect(await handleQueuedPromptCancel(cancelCtx)).toBe(true);
    expect(cancelCtx.answerCallbackQuery).toHaveBeenCalledWith({
      text: t("bot.session_queue_cancel_missing"),
    });
    expect(cancelCtx.editMessageText).not.toHaveBeenCalled();
  });

  it("ignores unrelated callbacks", async () => {
    const ctx = {
      callbackQuery: { data: "model:result:0" },
      answerCallbackQuery: vi.fn(),
    } as unknown as Context;

    expect(await handleQueuedPromptCancel(ctx)).toBe(false);
  });

  it("keeps the response mode for the whole turn until cleared", () => {
    activatePromptResponseMode("session-9", "text_and_tts");

    expect(getPromptResponseMode("session-9")).toBe("text_and_tts");
    expect(getPromptResponseMode("session-9")).toBe("text_and_tts");

    clearPromptResponseMode("session-9");

    expect(getPromptResponseMode("session-9")).toBeNull();
  });

  it("lists and clears queued prompts", async () => {
    mocked.getScheduledTaskTopicByChatAndThreadMock.mockResolvedValue(null);
    mocked.sessionStatusMock.mockResolvedValue({
      data: { "session-1": { type: "busy" } },
      error: null,
    });

    const ctx = createContext();
    await processUserPrompt(ctx, "First", {
      bot: {} as Bot<Context>,
      ensureEventSubscription: vi.fn(),
    });
    await processUserPrompt(ctx, "Second", {
      bot: {} as Bot<Context>,
      ensureEventSubscription: vi.fn(),
    });

    expect(listQueuedPrompts("session-1").map((entry) => entry.preview)).toEqual([
      "First",
      "Second",
    ]);
    expect(clearQueuedPrompts("session-1")).toBe(2);
    expect(getQueuedPromptCountForTests("session-1")).toBe(0);
    expect(clearQueuedPrompts("session-1")).toBe(0);
  });

  it("moves a queued prompt to the front", async () => {
    mocked.getScheduledTaskTopicByChatAndThreadMock.mockResolvedValue(null);
    mocked.sessionStatusMock.mockResolvedValue({
      data: { "session-1": { type: "busy" } },
      error: null,
    });
    const bot = {
      api: { sendMessage: vi.fn().mockResolvedValue(undefined) },
    } as unknown as Bot<Context>;

    const firstCtx = createContext();
    await processUserPrompt(firstCtx, "First", {
      bot,
      ensureEventSubscription: vi.fn(),
    });
    const secondCtx = createContext();
    await processUserPrompt(secondCtx, "Second", {
      bot,
      ensureEventSubscription: vi.fn(),
    });

    const secondMarkup = (secondCtx.reply as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]
      ?.reply_markup as { inline_keyboard?: Array<Array<{ callback_data?: string }>> };
    const frontCallback = secondMarkup?.inline_keyboard
      ?.flat()
      .map((button) => button.callback_data ?? "")
      .find((data) => data.startsWith("queue:front:"));
    expect(frontCallback).toBeDefined();

    const cancelCtx = {
      callbackQuery: { data: frontCallback },
      answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
      editMessageText: vi.fn().mockResolvedValue(undefined),
    } as unknown as Context;

    expect(await handleQueuedPromptFront(cancelCtx)).toBe(true);
    expect(listQueuedPrompts("session-1").map((entry) => entry.preview)).toEqual([
      "Second",
      "First",
    ]);
    expect(cancelCtx.editMessageText).toHaveBeenCalledWith(expect.stringContaining("⏫"));
  });

  it("steers a queued prompt on v2 without aborting", async () => {
    mocked.serverVersion = "v2";
    mocked.getScheduledTaskTopicByChatAndThreadMock.mockResolvedValue(null);
    mocked.sessionStatusMock.mockResolvedValue({
      data: { "session-1": { type: "busy" } },
      error: null,
    });
    const bot = {
      api: { sendMessage: vi.fn().mockResolvedValue(undefined) },
    } as unknown as Bot<Context>;

    const ctx = createContext();
    await processUserPrompt(ctx, "Urgent", {
      bot,
      ensureEventSubscription: vi.fn(),
    });

    const markup = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]?.reply_markup as {
      inline_keyboard?: Array<Array<{ callback_data?: string }>>;
    };
    const steerCallback = markup?.inline_keyboard
      ?.flat()
      .map((button) => button.callback_data ?? "")
      .find((data) => data.startsWith("queue:steer:"));
    expect(steerCallback).toBeDefined();

    const steerCtx = {
      callbackQuery: { data: steerCallback },
      answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
      editMessageText: vi.fn().mockResolvedValue(undefined),
    } as unknown as Context;

    expect(await handleQueuedPromptSteer(steerCtx)).toBe(true);

    expect(getQueuedPromptCountForTests("session-1")).toBe(0);
    expect(mocked.sessionAbortMock).not.toHaveBeenCalled();
    expect(mocked.sessionPromptAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({ delivery: "steer" }),
    );
    expect(steerCtx.editMessageText).toHaveBeenCalledWith(expect.stringContaining("⚡"));
  });

  it("aborts before steering on v1", async () => {
    mocked.serverVersion = "v1";
    mocked.sessionAbortMock.mockResolvedValue({ data: true, error: null });
    mocked.getScheduledTaskTopicByChatAndThreadMock.mockResolvedValue(null);
    mocked.sessionStatusMock.mockResolvedValue({
      data: { "session-1": { type: "busy" } },
      error: null,
    });
    const bot = {
      api: { sendMessage: vi.fn().mockResolvedValue(undefined) },
    } as unknown as Bot<Context>;

    const ctx = createContext();
    await processUserPrompt(ctx, "Urgent", {
      bot,
      ensureEventSubscription: vi.fn(),
    });
    expect(getQueuedPromptCountForTests("session-1")).toBe(1);

    // grab the queue id from the notice keyboard and steer it
    const markup = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]?.reply_markup as {
      inline_keyboard?: Array<Array<{ callback_data?: string }>>;
    };
    const steerCallback = markup?.inline_keyboard
      ?.flat()
      .map((button) => button.callback_data ?? "")
      .find((data) => data.startsWith("queue:steer:"));

    const steerCtx = {
      callbackQuery: { data: steerCallback },
      answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
      editMessageText: vi.fn().mockResolvedValue(undefined),
    } as unknown as Context;

    expect(await handleQueuedPromptSteer(steerCtx)).toBe(true);

    expect(mocked.sessionAbortMock).toHaveBeenCalled();
    expect(mocked.sessionPromptAsyncMock).toHaveBeenCalledWith(
      expect.not.objectContaining({ delivery: "steer" }),
    );
    mocked.serverVersion = "v2";
  });

  it("answers missing for front and steer on unknown ids", async () => {
    for (const [handler, prefix] of [
      [handleQueuedPromptFront, "queue:front:"],
      [handleQueuedPromptSteer, "queue:steer:"],
    ] as const) {
      const ctx = {
        callbackQuery: { data: `${prefix}nope` },
        answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
        editMessageText: vi.fn(),
      } as unknown as Context;

      expect(await handler(ctx)).toBe(true);
      expect(ctx.answerCallbackQuery).toHaveBeenCalledWith({
        text: t("bot.session_queue_cancel_missing"),
      });
    }
  });

  it("ignores unrelated front and steer callbacks", async () => {
    const ctx = {
      callbackQuery: { data: "model:result:0" },
      answerCallbackQuery: vi.fn(),
    } as unknown as Context;

    expect(await handleQueuedPromptFront(ctx)).toBe(false);
    expect(await handleQueuedPromptSteer(ctx)).toBe(false);
  });

  it("persists queued prompts when they are queued and removed", async () => {
    mocked.getScheduledTaskTopicByChatAndThreadMock.mockResolvedValue(null);
    mocked.sessionStatusMock.mockResolvedValue({
      data: { "session-1": { type: "busy" } },
      error: null,
    });

    const ctx = createContext();
    await processUserPrompt(ctx, "Queued hello", {
      bot: {} as Bot<Context>,
      ensureEventSubscription: vi.fn(),
    });

    expect(mocked.setPersistedQueueMock).toHaveBeenCalled();
    const saved = mocked.setPersistedQueueMock.mock.calls.at(-1)?.[0] as Record<string, unknown[]>;
    expect(Object.keys(saved)).toEqual(["session-1"]);
    expect(saved["session-1"]).toHaveLength(1);

    expect(clearQueuedPrompts("session-1")).toBe(1);

    const cleared = mocked.setPersistedQueueMock.mock.calls.at(-1)?.[0] as Record<string, unknown[]>;
    expect(cleared).toEqual({});
  });

  function storedQueueEntry(overrides: Record<string, unknown> = {}) {
    return {
      queueId: "q1",
      sessionId: "session-1",
      chatId: -100123,
      threadId: 555,
      responseMode: "text_only",
      promptOptions: {
        sessionID: "session-1",
        directory: "/repo/app",
        parts: [{ type: "text", text: "Restored hello" }],
      },
      promptErrorLogContext: {
        sessionId: "session-1",
        directory: "/repo/app",
        agent: "build",
        modelProvider: "openai",
        modelID: "gpt-5",
        variant: "fast",
        promptLength: 14,
        fileCount: 0,
      },
      ...overrides,
    };
  }

  it("restores queued prompts from settings for live sessions", async () => {
    mocked.persistedQueue = { "session-1": [storedQueueEntry()] };
    mocked.probeMock.mockResolvedValue({ kind: "found" });
    mocked.sessionGetMock.mockResolvedValue({ data: { id: "session-1" }, error: null });

    const restored = await restoreQueuedPromptsFromSettings();

    expect(restored).toBe(1);
    expect(getQueuedPromptCountForTests("session-1")).toBe(1);
    expect(listQueuedPrompts("session-1")).toEqual([
      { queueId: "q1", preview: "Restored hello" },
    ]);
  });

  it("drops restored entries for sessions that no longer exist", async () => {
    mocked.persistedQueue = { "session-gone": [storedQueueEntry({ sessionId: "session-gone" })] };
    mocked.probeMock.mockResolvedValue({ kind: "found" });
    mocked.sessionGetMock.mockResolvedValue({ data: null, error: new Error("gone") });

    const restored = await restoreQueuedPromptsFromSettings();

    expect(restored).toBe(0);
    expect(getQueuedPromptCountForTests("session-gone")).toBe(0);
  });

  it("restores and revalidates queued prompts on load", async () => {
    mocked.persistedQueue = { "session-1": [storedQueueEntry()] };
    mocked.probeMock.mockResolvedValue({ kind: "found" });
    mocked.sessionGetMock.mockResolvedValue({ data: { id: "session-1" }, error: null });

    const restored = await restoreQueuedPromptsFromSettings();

    expect(restored).toBe(1);
    expect(getQueuedPromptCountForTests("session-1")).toBe(1);
  });

  it("keeps restored entries when the server is unreachable", async () => {
    mocked.persistedQueue = { "session-1": [storedQueueEntry()] };
    mocked.probeMock.mockResolvedValue({ kind: "none" });

    const restored = await restoreQueuedPromptsFromSettings();

    expect(restored).toBe(1);
    expect(getQueuedPromptCountForTests("session-1")).toBe(1);
    expect(mocked.sessionGetMock).not.toHaveBeenCalled();
  });

  it("dispatches restored queues once subscriptions are live", async () => {
    mocked.persistedQueue = { "session-1": [storedQueueEntry()] };
    mocked.probeMock.mockResolvedValue({ kind: "found" });
    mocked.sessionGetMock.mockResolvedValue({ data: { id: "session-1" }, error: null });
    mocked.sessionStatusMock.mockResolvedValue({
      data: { "session-1": { type: "idle" } },
      error: null,
    });
    const bot = {
      api: { sendMessage: vi.fn().mockResolvedValue(undefined) },
    } as unknown as Bot<Context>;

    await restoreQueuedPromptsFromSettings();
    expect(getQueuedPromptCountForTests("session-1")).toBe(1);

    // A live prompt connects the module bot instance, like the real startup flow.
    mocked.getScheduledTaskTopicByChatAndThreadMock.mockResolvedValue(null);
    await processUserPrompt(createContext(), "Live hello", {
      bot,
      ensureEventSubscription: vi.fn(),
    });

    await dispatchRestoredQueues();

    expect(getQueuedPromptCountForTests("session-1")).toBe(0);
    expect(mocked.sessionPromptAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        parts: [{ type: "text", text: "Restored hello" }],
      }),
    );
    expect(bot.api.sendMessage).toHaveBeenCalledWith(
      -100123,
      expect.stringContaining("▶️"),
      expect.anything(),
    );
  });

  it("refreshes a busy re-enqueue in place instead of stacking a duplicate", () => {
    __resetQueuedPromptsForTests();

    const first = storedQueueEntry({ notifyOnQueue: false });
    const requeued = storedQueueEntry({ notifyOnQueue: false });

    expect(__enqueuePromptRequestForTests(first as never)).toBe(1);
    // Same queueId arriving again (busy retry) must not duplicate the entry.
    expect(__enqueuePromptRequestForTests(requeued as never)).toBe(1);
    expect(getQueuedPromptCountForTests("session-1")).toBe(1);
    expect(listQueuedPrompts("session-1")).toHaveLength(1);

    __resetQueuedPromptsForTests();
  });
});
