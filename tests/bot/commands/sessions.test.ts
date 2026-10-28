import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "grammy";
import { sessionsCommand, handleSessionSelect, handleBackgroundSessionOpen } from "../../../src/bot/commands/sessions.js";
import { interactionManager } from "../../../src/interaction/manager.js";
import { t } from "../../../src/i18n/index.js";

const mocked = vi.hoisted(() => ({
  currentProject: {
    id: "project-1",
    worktree: "/repo",
  } as { id: string; worktree: string; name?: string } | null,
  projectDirectoryExistsMock: vi.fn(() => Promise.resolve(true)),
  sessionListMock: vi.fn(),
  sessionGetMock: vi.fn(),
  sessionMessagesMock: vi.fn(),
  setCurrentSessionMock: vi.fn(),
  clearSummaryMock: vi.fn(),
  setSummarySessionMock: vi.fn(),
  clearInteractionMock: vi.fn(),
  keyboardInitializeMock: vi.fn(),
  keyboardGetKeyboardMock: vi.fn(() => ({ inline_keyboard: [] })),
  keyboardUpdateContextMock: vi.fn(),
  keyboardGetContextInfoMock: vi.fn(() => null),
  agentResolveProjectAgentMock: vi.fn(async (agent: string) => agent),
  agentGetStoredAgentMock: vi.fn(() => "builder"),
  modelGetStoredModelMock: vi.fn(() => ({ providerID: "openai", modelID: "gpt-5" })),
  settingsSetCurrentModelMock: vi.fn(),
  settingsClearTopicSessionBindingMock: vi.fn(),
  topicGetBindingBySessionIdMock: vi.fn(() => undefined),
  pinnedIsInitializedMock: vi.fn(() => false),
  pinnedInitializeMock: vi.fn(),
  pinnedOnSessionChangeMock: vi.fn(),
  pinnedLoadContextFromHistoryMock: vi.fn(),
  pinnedGetContextInfoMock: vi.fn(() => null),
  pinnedGetContextLimitMock: vi.fn(() => 0),
  pinnedRefreshContextLimitMock: vi.fn(),
  safeBackgroundTaskMock: vi.fn(),
}));

vi.mock("../../../src/opencode/client.js", () => ({
  opencodeClient: {
    session: {
      list: mocked.sessionListMock,
      get: mocked.sessionGetMock,
      messages: mocked.sessionMessagesMock,
    },
  },
}));

vi.mock("../../../src/settings/manager.js", () => ({
  TOPIC_SESSION_STATUS: {
    ACTIVE: "active",
    CLOSED: "closed",
    STALE: "stale",
    ABANDONED: "abandoned",
    ERROR: "error",
  },
  getCurrentProject: vi.fn(() => mocked.currentProject),
  setCurrentProject: vi.fn(),
  setCurrentAgent: vi.fn(),
  setCurrentModel: mocked.settingsSetCurrentModelMock,
  clearTopicSessionBinding: mocked.settingsClearTopicSessionBindingMock,
  getScopedSessions: vi.fn(() => ({})),
}));

vi.mock("../../../src/agent/manager.js", () => ({
  resolveProjectAgent: mocked.agentResolveProjectAgentMock,
  getStoredAgent: mocked.agentGetStoredAgentMock,
}));

vi.mock("../../../src/model/manager.js", () => ({
  getStoredModel: mocked.modelGetStoredModelMock,
}));

vi.mock("../../../src/project/directory.js", () => ({
  projectDirectoryExists: mocked.projectDirectoryExistsMock,
}));

vi.mock("../../../src/session/manager.js", () => ({
  setCurrentSession: mocked.setCurrentSessionMock,
}));

vi.mock("../../../src/topic/manager.js", () => ({
  getTopicBindingBySessionId: mocked.topicGetBindingBySessionIdMock,
  registerTopicSessionBinding: vi.fn(),
}));

vi.mock("../../../src/summary/aggregator.js", () => ({
  summaryAggregator: {
    clear: mocked.clearSummaryMock,
    setSession: mocked.setSummarySessionMock,
  },
}));

vi.mock("../../../src/interaction/cleanup.js", () => ({
  clearAllInteractionState: mocked.clearInteractionMock,
}));

vi.mock("../../../src/keyboard/manager.js", () => ({
  keyboardManager: {
    initialize: mocked.keyboardInitializeMock,
    getKeyboard: mocked.keyboardGetKeyboardMock,
    updateContext: mocked.keyboardUpdateContextMock,
    getContextInfo: mocked.keyboardGetContextInfoMock,
  },
}));

vi.mock("../../../src/pinned/manager.js", () => ({
  pinnedMessageManager: {
    isInitialized: mocked.pinnedIsInitializedMock,
    initialize: mocked.pinnedInitializeMock,
    onSessionChange: mocked.pinnedOnSessionChangeMock,
    loadContextFromHistory: mocked.pinnedLoadContextFromHistoryMock,
    getContextInfo: mocked.pinnedGetContextInfoMock,
    getContextLimit: mocked.pinnedGetContextLimitMock,
    refreshContextLimit: mocked.pinnedRefreshContextLimitMock,
  },
}));

vi.mock("../../../src/utils/safe-background-task.js", () => ({
  safeBackgroundTask: mocked.safeBackgroundTaskMock,
}));

type SessionStub = {
  id: string;
  title: string;
  directory: string;
  time: {
    created: number;
  };
};

function createSession(index: number): SessionStub {
  return {
    id: `session-${index + 1}`,
    title: `Session ${index + 1}`,
    directory: "/repo",
    time: {
      created: 1700000000000 + index * 1000,
    },
  };
}

function createCommandContext(): Context {
  return {
    chat: { id: 111 },
    reply: vi.fn().mockResolvedValue({ message_id: 456 }),
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    deleteMessage: vi.fn().mockResolvedValue(undefined),
    api: {
      sendMessage: vi.fn().mockResolvedValue({ message_id: 999 }),
      deleteMessage: vi.fn().mockResolvedValue(true),
      editMessageText: vi.fn().mockResolvedValue(true),
    },
  } as unknown as Context;
}

function createCallbackContext(data: string, messageId: number): Context {
  return {
    chat: { id: 111 },
    callbackQuery: {
      data,
      message: {
        message_id: messageId,
        message_thread_id: 777,
      },
    } as Context["callbackQuery"],
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    deleteMessage: vi.fn().mockResolvedValue(undefined),
    editMessageText: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    api: {
      sendMessage: vi.fn().mockResolvedValue({ message_id: 888 }),
      deleteMessage: vi.fn().mockResolvedValue(true),
      editMessageText: vi.fn().mockResolvedValue(true),
      createForumTopic: vi.fn().mockResolvedValue({ message_thread_id: 5 }),
    },
  } as unknown as Context;
}

function startActiveSessionInlineMenu(): void {
  interactionManager.start(
    {
      kind: "inline",
      expectedInput: "callback",
      metadata: {
        menuKind: "session",
        messageId: 456,
      },
    },
    "111:777",
  );
}

function getKeyboardButtons(ctx: Context): Array<Array<{ text: string; callback_data?: string }>> {
  const calls = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls;
  const options = calls[0]?.[1] as {
    reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data?: string }>> };
  };
  return options.reply_markup.inline_keyboard;
}

describe("bot/commands/sessions", () => {
  beforeEach(() => {
    interactionManager.clear("test_setup");
    mocked.currentProject = {
      id: "project-1",
      worktree: "/repo",
    };

    mocked.projectDirectoryExistsMock.mockReset();
    mocked.projectDirectoryExistsMock.mockResolvedValue(true);
    mocked.sessionListMock.mockReset();
    mocked.sessionGetMock.mockReset();
    mocked.sessionMessagesMock.mockReset();
    mocked.sessionMessagesMock.mockResolvedValue({
      data: [
        {
          info: { role: "assistant", time: { created: 2 } },
          parts: [{ type: "text", text: "Latest agent reply" }],
        },
      ],
      error: null,
    });
    mocked.setCurrentSessionMock.mockReset();
    mocked.clearSummaryMock.mockReset();
    mocked.setSummarySessionMock.mockReset();
    mocked.clearInteractionMock.mockReset();
    mocked.keyboardInitializeMock.mockReset();
    mocked.keyboardGetKeyboardMock.mockReset();
    mocked.keyboardGetKeyboardMock.mockReturnValue({ inline_keyboard: [] });
    mocked.keyboardUpdateContextMock.mockReset();
    mocked.keyboardGetContextInfoMock.mockReset();
    mocked.keyboardGetContextInfoMock.mockReturnValue(null);
    mocked.agentResolveProjectAgentMock.mockReset();
    mocked.agentGetStoredAgentMock.mockReset();
    mocked.modelGetStoredModelMock.mockReset();
    mocked.settingsSetCurrentModelMock.mockReset();
    mocked.settingsClearTopicSessionBindingMock.mockReset();
    mocked.topicGetBindingBySessionIdMock.mockReset();
    mocked.topicGetBindingBySessionIdMock.mockReturnValue(undefined);
    mocked.pinnedIsInitializedMock.mockReset();
    mocked.pinnedIsInitializedMock.mockReturnValue(false);
    mocked.pinnedInitializeMock.mockReset();
    mocked.pinnedOnSessionChangeMock.mockReset();
    mocked.pinnedOnSessionChangeMock.mockResolvedValue(undefined);
    mocked.pinnedLoadContextFromHistoryMock.mockReset();
    mocked.pinnedLoadContextFromHistoryMock.mockResolvedValue(undefined);
    mocked.pinnedGetContextInfoMock.mockReset();
    mocked.pinnedGetContextInfoMock.mockReturnValue(null);
    mocked.pinnedGetContextLimitMock.mockReset();
    mocked.pinnedGetContextLimitMock.mockReturnValue(0);
    mocked.pinnedRefreshContextLimitMock.mockReset();
    mocked.pinnedRefreshContextLimitMock.mockResolvedValue(undefined);
    mocked.safeBackgroundTaskMock.mockReset();
  });

  it("answers with a notice when the current project directory is gone", async () => {
    mocked.projectDirectoryExistsMock.mockResolvedValue(false);

    const ctx = createCommandContext();
    await sessionsCommand(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith(t("projects.worktree_missing"), {});
    expect(mocked.sessionListMock).not.toHaveBeenCalled();
  });

  it("shows next-page button when sessions exceed page size", async () => {
    const sessions = Array.from({ length: 11 }, (_, index) => createSession(index));
    mocked.sessionListMock.mockResolvedValueOnce({ data: sessions, error: null });

    const ctx = createCommandContext();
    await sessionsCommand(ctx as never);

    expect(mocked.sessionListMock).toHaveBeenCalledWith({
      directory: "/repo",
      limit: 11,
      roots: true,
    });

    const keyboardRows = getKeyboardButtons(ctx);
    expect(keyboardRows[0]?.[0]?.callback_data).toBe("session:session-1");
    expect(keyboardRows[9]?.[0]?.callback_data).toBe("session:session-10");
    expect(keyboardRows[10]?.[0]?.callback_data).toBe("session:page:1");
    expect(keyboardRows[11]?.[0]?.callback_data).toBe("inline:cancel:session");
  });

  it("handles next-page callback and renders second page with prev button", async () => {
    const pageTwoData = Array.from({ length: 12 }, (_, index) => createSession(index));
    mocked.sessionListMock.mockResolvedValueOnce({ data: pageTwoData, error: null });

    startActiveSessionInlineMenu();

    const ctx = createCallbackContext("session:page:1", 456);
    const handled = await handleSessionSelect(ctx);

    expect(handled).toBe(true);
    expect(mocked.sessionListMock).toHaveBeenCalledWith({
      directory: "/repo",
      limit: 21,
      roots: true,
    });
    expect(ctx.editMessageText).toHaveBeenCalledTimes(1);

    const [text, options] = (ctx.editMessageText as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      { reply_markup: { inline_keyboard: Array<Array<{ callback_data?: string }>> } },
    ];

    expect(text).toBe(t("sessions.select_page", { page: 2 }));
    const inlineRows = options.reply_markup.inline_keyboard;
    expect(inlineRows[0]?.[0]?.callback_data).toBe("session:session-11");
    expect(inlineRows[1]?.[0]?.callback_data).toBe("session:session-12");
    expect(inlineRows[2]?.[0]?.callback_data).toBe("session:page:0");
    expect(inlineRows[3]?.[0]?.callback_data).toBe("inline:cancel:session");
  });

  it("returns page-empty callback message when requested page has no sessions", async () => {
    mocked.sessionListMock.mockResolvedValueOnce({ data: [], error: null });

    startActiveSessionInlineMenu();

    const ctx = createCallbackContext("session:page:2", 456);
    const handled = await handleSessionSelect(ctx);

    expect(handled).toBe(true);
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith({
      text: t("sessions.page_empty_callback"),
    });
    expect(ctx.editMessageText).not.toHaveBeenCalled();
  });

  it("keeps active menu and interaction state when page load fails", async () => {
    mocked.sessionListMock.mockResolvedValueOnce({
      data: null,
      error: new Error("session list failed"),
    });

    startActiveSessionInlineMenu();

    const ctx = createCallbackContext("session:page:1", 456);
    const handled = await handleSessionSelect(ctx);

    expect(handled).toBe(true);
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith({
      text: t("sessions.page_load_error_callback"),
    });
    expect((ctx.api.deleteMessage as ReturnType<typeof vi.fn>).mock.calls).toEqual([]);
    expect(ctx.deleteMessage).not.toHaveBeenCalled();
    expect(mocked.clearInteractionMock).not.toHaveBeenCalled();
  });

  it("keeps generic selection error flow when session details fetch fails", async () => {
    mocked.sessionGetMock.mockResolvedValueOnce({
      data: null,
      error: new Error("session get failed"),
    });

    startActiveSessionInlineMenu();

    const ctx = createCallbackContext("session:session-1", 456);
    const handled = await handleSessionSelect(ctx);

    expect(handled).toBe(true);
    expect(mocked.clearInteractionMock).toHaveBeenCalledWith("session_select_error", "111:777");
    expect(ctx.answerCallbackQuery).toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(t("sessions.select_error"), {
      message_thread_id: 777,
    });
  });

  it("routes selected session confirmation and preview to current thread", async () => {
    mocked.sessionGetMock.mockResolvedValueOnce({
      data: {
        id: "session-1",
        title: "Thread Session",
      },
      error: null,
    });

    mocked.pinnedGetContextLimitMock.mockReturnValue(200000);

    startActiveSessionInlineMenu();
    const ctx = createCallbackContext("session:session-1", 456);
    const handled = await handleSessionSelect(ctx);

    expect(handled).toBe(true);

    const sendMessageCalls = (ctx.api.sendMessage as ReturnType<typeof vi.fn>).mock.calls;
    expect(sendMessageCalls.length).toBeGreaterThanOrEqual(2);
    expect(sendMessageCalls[0]?.[2]).toMatchObject({ message_thread_id: 777 });

    const selectedCall = sendMessageCalls.find(
      (call) => typeof call[1] === "string" && (call[1] as string).includes("Thread Session"),
    );
    expect(selectedCall?.[2]).toMatchObject({ message_thread_id: 777 });

    expect(mocked.safeBackgroundTaskMock).toHaveBeenCalledTimes(1);
    const queued = mocked.safeBackgroundTaskMock.mock.calls[0]?.[0] as {
      task: () => Promise<void>;
    };
    await queued.task();

    const allCalls = (ctx.api.sendMessage as ReturnType<typeof vi.fn>).mock.calls;
    const previewCall = allCalls[allCalls.length - 1];
    expect(previewCall?.[2]).toMatchObject({ message_thread_id: 777 });
    expect(previewCall?.[1]).toContain(t("sessions.resume.assistant_title"));
  });

  it("falls back to the last visible turn when no assistant reply exists", async () => {
    mocked.sessionGetMock.mockResolvedValueOnce({
      data: {
        id: "session-1",
        title: "Thread Session",
      },
      error: null,
    });
    mocked.sessionMessagesMock
      .mockResolvedValueOnce({
        data: [
          {
            info: { role: "user", time: { created: 1 } },
            parts: [{ type: "text", text: "Latest user note" }],
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            info: { role: "user", time: { created: 1 } },
            parts: [{ type: "text", text: "Latest user note" }],
          },
        ],
        error: null,
      });

    mocked.pinnedGetContextLimitMock.mockReturnValue(200000);

    startActiveSessionInlineMenu();
    const ctx = createCallbackContext("session:session-1", 456);
    await handleSessionSelect(ctx);

    const queued = mocked.safeBackgroundTaskMock.mock.calls[0]?.[0] as {
      task: () => Promise<void>;
    };
    await queued.task();

    const allCalls = (ctx.api.sendMessage as ReturnType<typeof vi.fn>).mock.calls;
    const previewCall = allCalls[allCalls.length - 1];
    expect(previewCall?.[1]).toContain(t("sessions.resume.last_turn_title"));
    expect(previewCall?.[1]).toContain("Latest user note");
  });

  it("does not convert a successful selection into an error when menu deletion fails", async () => {
    mocked.sessionGetMock.mockResolvedValueOnce({
      data: {
        id: "session-1",
        title: "Thread Session",
      },
      error: null,
    });

    mocked.pinnedGetContextLimitMock.mockReturnValue(200000);

    startActiveSessionInlineMenu();
    const ctx = createCallbackContext("session:session-1", 456);
    (ctx.deleteMessage as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("delete failed"),
    );

    const handled = await handleSessionSelect(ctx);

    expect(handled).toBe(true);
    expect(ctx.answerCallbackQuery).toHaveBeenCalled();
    expect(ctx.reply).not.toHaveBeenCalledWith(t("sessions.select_error"), expect.anything());
  });

  it("explains missing topic rights when General cannot create the session topic", async () => {
    mocked.sessionGetMock.mockResolvedValueOnce({
      data: {
        id: "session-9",
        title: "General Session",
      },
      error: null,
    });

    interactionManager.start(
      {
        kind: "inline",
        expectedInput: "callback",
        metadata: {
          menuKind: "session",
          messageId: 456,
        },
      },
      "111:1",
    );
    const ctx = createCallbackContext("session:session-9", 456);
    (ctx as { chat?: unknown }).chat = { id: 111, type: "supergroup", is_forum: true };
    ((ctx.callbackQuery as { message?: unknown }).message as { message_thread_id?: number })
      .message_thread_id = 1;
    (
      ctx.api.createForumTopic as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(
      new Error(
        "Call to 'createForumTopic' failed! (400: Bad Request: not enough rights to create a topic)",
      ),
    );

    const handled = await handleSessionSelect(ctx);

    expect(handled).toBe(true);
    expect(ctx.reply).toHaveBeenCalledWith(t("new.topic_create_no_rights"), expect.anything());
    expect(mocked.setCurrentSessionMock).not.toHaveBeenCalled();
  });

  it("keeps the existing session model and agent instead of scope defaults", async () => {
    mocked.sessionGetMock.mockResolvedValueOnce({
      data: {
        id: "session-9",
        title: "Existing Session",
        model: { providerID: "anthropic", id: "claude-opus", variant: "fast" },
        agent: "review",
      },
      error: null,
    });

    interactionManager.start(
      {
        kind: "inline",
        expectedInput: "callback",
        metadata: {
          menuKind: "session",
          messageId: 456,
        },
      },
      "111:1",
    );
    const ctx = createCallbackContext("session:session-9", 456);
    (ctx as { chat?: unknown }).chat = { id: 111, type: "supergroup", is_forum: true };
    ((ctx.callbackQuery as { message?: unknown }).message as { message_thread_id?: number })
      .message_thread_id = 1;

    const handled = await handleSessionSelect(ctx);

    expect(handled).toBe(true);
    expect(mocked.settingsSetCurrentModelMock).toHaveBeenCalledWith(
      { providerID: "anthropic", modelID: "claude-opus", variant: "fast" },
      expect.anything(),
    );
  });

  it("links to the first bot message inside the created topic", async () => {
    mocked.sessionGetMock.mockResolvedValueOnce({
      data: {
        id: "session-9",
        title: "Existing Session",
      },
      error: null,
    });

    interactionManager.start(
      {
        kind: "inline",
        expectedInput: "callback",
        metadata: {
          menuKind: "session",
          messageId: 456,
        },
      },
      "-1001234567890:1",
    );
    const ctx = createCallbackContext("session:session-9", 456);
    (ctx as { chat?: unknown }).chat = { id: -1001234567890, type: "supergroup", is_forum: true };
    ((ctx.callbackQuery as { message?: unknown }).message as { message_thread_id?: number })
      .message_thread_id = 1;
    (ctx.api.createForumTopic as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      message_thread_id: 49,
    });
    (ctx.api.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ message_id: 888 });

    await handleSessionSelect(ctx);

    const linkReply = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls.find(
      ([text]) => typeof text === "string" && text.includes("https://t.me/c/1234567890/888"),
    );
    expect(linkReply).toBeDefined();
  });

  it("recreates the topic when the bound topic was deleted manually", async () => {
    mocked.sessionGetMock.mockResolvedValueOnce({
      data: {
        id: "session-9",
        title: "Existing Session",
      },
      error: null,
    });
    mocked.topicGetBindingBySessionIdMock.mockReturnValueOnce({
      scopeKey: "111:49",
      chatId: 111,
      threadId: 49,
      sessionId: "session-9",
      projectId: "project-1",
      projectWorktree: "/repo",
      topicName: "Existing Session",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });

    interactionManager.start(
      {
        kind: "inline",
        expectedInput: "callback",
        metadata: {
          menuKind: "session",
          messageId: 456,
        },
      },
      "111:1",
    );
    const ctx = createCallbackContext("session:session-9", 456);
    (ctx as { chat?: unknown }).chat = { id: 111, type: "supergroup", is_forum: true };
    ((ctx.callbackQuery as { message?: unknown }).message as { message_thread_id?: number })
      .message_thread_id = 1;
    (ctx.api.sendMessage as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Bad Request: message thread is not found"),
    );
    (ctx.api.createForumTopic as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      message_thread_id: 50,
    });

    await handleSessionSelect(ctx);

    expect(mocked.settingsClearTopicSessionBindingMock).toHaveBeenCalledWith("111:49");
    expect(ctx.api.createForumTopic).toHaveBeenCalled();
    const linkReply = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls.find(
      ([text]) => typeof text === "string" && text.includes("https://t.me/c/111/888"),
    );
    expect(linkReply).toBeDefined();
  });

  it("ignores callbacks that are not background-session opens", async () => {
    const ctx = createCallbackContext("session:session-9", 456);
    expect(await handleBackgroundSessionOpen(ctx)).toBe(false);
    expect(ctx.answerCallbackQuery).not.toHaveBeenCalled();
  });

  it("toasts an error when the background session has no topic binding", async () => {
    mocked.topicGetBindingBySessionIdMock.mockReturnValue(undefined);
    const ctx = createCallbackContext("background-session:a:session-9", 456);

    const handled = await handleBackgroundSessionOpen(ctx);

    expect(handled).toBe(true);
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith({
      text: t("sessions.select_error"),
      show_alert: true,
    });
    expect(ctx.api.sendMessage).not.toHaveBeenCalled();
  });

  it("acks silently when the tap already happens inside the session topic", async () => {
    mocked.topicGetBindingBySessionIdMock.mockReturnValue({
      scopeKey: "111:777",
      chatId: 111,
      threadId: 777,
      sessionId: "session-9",
      topicName: "Session 9",
    });
    const ctx = createCallbackContext("background-session:q:session-9", 456);

    const handled = await handleBackgroundSessionOpen(ctx);

    expect(handled).toBe(true);
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith();
    expect(ctx.api.sendMessage).not.toHaveBeenCalled();
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it("replies with a topic link when the tap comes from outside the session topic", async () => {
    mocked.topicGetBindingBySessionIdMock.mockReturnValue({
      scopeKey: "-100777:555",
      chatId: -100777,
      threadId: 555,
      sessionId: "session-9",
      topicName: "Session 9",
    });
    const ctx = createCallbackContext("background-session:p:session-9", 456);
    (ctx as { chat?: unknown }).chat = { id: -100777, type: "supergroup", is_forum: true };

    const handled = await handleBackgroundSessionOpen(ctx);

    expect(handled).toBe(true);
    expect(ctx.api.sendMessage).toHaveBeenCalledWith(
      -100777,
      expect.any(String),
      expect.objectContaining({ message_thread_id: 555 }),
    );
    const linkReply = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls.find(
      ([text]) => typeof text === "string" && text.includes("https://t.me/c/"),
    );
    expect(linkReply).toBeDefined();
  });
});
