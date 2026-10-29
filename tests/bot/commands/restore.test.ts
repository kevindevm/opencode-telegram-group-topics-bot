import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "grammy";

const mocked = vi.hoisted(() => ({
  listMock: vi.fn(),
  statusMock: vi.fn(),
  getProjectMock: vi.fn(),
  setProjectMock: vi.fn(),
  setSessionMock: vi.fn(),
  setAgentMock: vi.fn(),
  setModelMock: vi.fn(),
  dirExistsMock: vi.fn(),
  resolveAgentMock: vi.fn(),
  storedAgentMock: vi.fn(),
  storedModelMock: vi.fn(),
  setSessionAggMock: vi.fn(),
  bindingMock: vi.fn(),
  registerBindingMock: vi.fn(),
  pinIsInitMock: vi.fn(),
  pinInitMock: vi.fn(),
  pinChangeMock: vi.fn(),
  pinHistoryMock: vi.fn(),
  pinContextMock: vi.fn(),
  kbInitMock: vi.fn(),
  kbContextMock: vi.fn(),
  createKeyboardMock: vi.fn(),
  variantMock: vi.fn(),
  isGeneralMock: vi.fn(),
  resolveModelMock: vi.fn(),
}));

vi.mock("../../../src/opencode/client.js", () => ({
  opencodeClient: {
    session: {
      list: mocked.listMock,
      status: mocked.statusMock,
    },
  },
}));

vi.mock("../../../src/settings/manager.js", () => ({
  TOPIC_SESSION_STATUS: { ACTIVE: "active" },
  getCurrentProject: mocked.getProjectMock,
  setCurrentProject: mocked.setProjectMock,
  setCurrentAgent: mocked.setAgentMock,
  setCurrentModel: mocked.setModelMock,
}));

vi.mock("../../../src/session/manager.js", () => ({
  setCurrentSession: mocked.setSessionMock,
}));

vi.mock("../../../src/project/directory.js", () => ({
  projectDirectoryExists: mocked.dirExistsMock,
}));

vi.mock("../../../src/agent/manager.js", () => ({
  resolveProjectAgent: mocked.resolveAgentMock,
  getStoredAgent: mocked.storedAgentMock,
}));

vi.mock("../../../src/model/manager.js", () => ({
  getStoredModel: mocked.storedModelMock,
}));

vi.mock("../../../src/summary/aggregator.js", () => ({
  summaryAggregator: {
    setSession: mocked.setSessionAggMock,
    clear: vi.fn(),
    clearSession: vi.fn(),
  },
}));

vi.mock("../../../src/pinned/manager.js", () => ({
  pinnedMessageManager: {
    isInitialized: mocked.pinIsInitMock,
    initialize: mocked.pinInitMock,
    onSessionChange: mocked.pinChangeMock,
    loadContextFromHistory: mocked.pinHistoryMock,
    getContextInfo: mocked.pinContextMock,
  },
}));

vi.mock("../../../src/keyboard/manager.js", () => ({
  keyboardManager: {
    initialize: mocked.kbInitMock,
    getContextInfo: mocked.kbContextMock,
  },
}));

vi.mock("../../../src/bot/utils/keyboard.js", () => ({
  createMainKeyboard: mocked.createKeyboardMock,
}));

vi.mock("../../../src/variant/manager.js", () => ({
  formatVariantForButton: mocked.variantMock,
}));

vi.mock("../../../src/topic/manager.js", () => ({
  getTopicBindingBySessionId: mocked.bindingMock,
  registerTopicSessionBinding: mocked.registerBindingMock,
}));

vi.mock("../../../src/bot/commands/sessions.js", () => ({
  isGeneralForumScope: mocked.isGeneralMock,
  resolveTopicModel: mocked.resolveModelMock,
}));

vi.mock("../../../src/bot/scope.js", () => ({
  GLOBAL_SCOPE_KEY: "global",
  SCOPE_CONTEXT: { GROUP_TOPIC: "group_topic" },
  createScopeKeyFromParams: ({ chatId, threadId }: { chatId: number; threadId: number }) =>
    `chat:${chatId}:${threadId}`,
  getScopeFromContext: () => ({ key: "chat:-100123:1", threadId: 1 }),
  getThreadSendOptions: (threadId: number | null) =>
    threadId === null ? {} : { message_thread_id: threadId },
}));

import { restoreCommand } from "../../../src/bot/commands/restore.js";
import { t } from "../../../src/i18n/index.js";

function createCommandContext(): Context {
  return {
    chat: { id: -100123, type: "supergroup" },
    reply: vi.fn().mockResolvedValue(undefined),
    api: {
      createForumTopic: vi.fn().mockResolvedValue({ message_thread_id: 10 }),
      sendMessage: vi.fn().mockResolvedValue({ message_id: 99 }),
    },
  } as unknown as Context;
}

function listSession(id: string, title: string, updated = 1000) {
  return { id, title, directory: "/repo/a", time: { updated, created: 1 } };
}

describe("bot/commands/restore", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocked)) {
      (mock as ReturnType<typeof vi.fn>).mockReset();
    }
    mocked.isGeneralMock.mockReturnValue(true);
    mocked.getProjectMock.mockReturnValue({ id: "p1", worktree: "/repo/a" });
    mocked.dirExistsMock.mockResolvedValue(true);
    mocked.listMock.mockResolvedValue({ data: [], error: null });
    mocked.statusMock.mockResolvedValue({ data: {}, error: null });
    mocked.bindingMock.mockReturnValue(null);
    mocked.resolveAgentMock.mockResolvedValue("build");
    mocked.storedAgentMock.mockReturnValue("build");
    mocked.storedModelMock.mockReturnValue({
      providerID: "openai",
      modelID: "gpt-5",
      variant: "default",
    });
    mocked.resolveModelMock.mockReturnValue({
      providerID: "openai",
      modelID: "gpt-5",
      variant: "default",
    });
    mocked.pinIsInitMock.mockReturnValue(true);
    mocked.pinContextMock.mockReturnValue(null);
    mocked.kbContextMock.mockReturnValue(null);
    mocked.createKeyboardMock.mockReturnValue({ inline_keyboard: [] });
    mocked.variantMock.mockReturnValue("default");
    mocked.pinChangeMock.mockResolvedValue(undefined);
    mocked.pinHistoryMock.mockResolvedValue(undefined);
  });

  it("refuses to run outside the General topic", async () => {
    mocked.isGeneralMock.mockReturnValue(false);
    const ctx = createCommandContext();

    await restoreCommand(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith(t("restore.requires_forum_general"), {
      message_thread_id: 1,
    });
    expect(mocked.listMock).not.toHaveBeenCalled();
  });

  it("reports when every recent session already has a topic", async () => {
    mocked.listMock.mockResolvedValue({
      data: [listSession("s1", "one"), listSession("s2", "two")],
      error: null,
    });
    mocked.bindingMock.mockReturnValue({ sessionId: "s1" });
    const ctx = createCommandContext();

    await restoreCommand(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith(t("restore.empty"), { message_thread_id: 1 });
    expect(ctx.api.createForumTopic).not.toHaveBeenCalled();
  });

  it("creates topics for unbound sessions, running first, and skips bound ones", async () => {
    mocked.listMock.mockResolvedValue({
      data: [
        listSession("s-idle", "idle work", 3000),
        listSession("s-bound", "already there", 4000),
        listSession("s-busy", "active work", 1000),
      ],
      error: null,
    });
    mocked.statusMock.mockResolvedValue({
      data: { "s-busy": { type: "busy" } },
      error: null,
    });
    mocked.bindingMock.mockImplementation((id: string) =>
      id === "s-bound" ? { sessionId: "s-bound" } : null,
    );
    const ctx = createCommandContext();
    const createForumTopic = ctx.api.createForumTopic as ReturnType<typeof vi.fn>;
    createForumTopic
      .mockResolvedValueOnce({ message_thread_id: 11 })
      .mockResolvedValueOnce({ message_thread_id: 12 });

    await restoreCommand(ctx as never);

    expect(createForumTopic).toHaveBeenCalledTimes(2);
    expect(mocked.registerBindingMock).toHaveBeenCalledTimes(2);
    expect(mocked.registerBindingMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ sessionId: "s-busy", threadId: 11 }),
    );
    expect(mocked.registerBindingMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ sessionId: "s-idle", threadId: 12 }),
    );
    expect(ctx.reply).toHaveBeenLastCalledWith(
      expect.stringContaining(
        t("restore.result", { created: 2, skipped: 1, failed: 0 }),
      ),
      { message_thread_id: 1 },
    );
  });

  it("counts failures and keeps restoring the rest", async () => {
    mocked.listMock.mockResolvedValue({
      data: [listSession("s-bad", "bad"), listSession("s-good", "good")],
      error: null,
    });
    const ctx = createCommandContext();
    (ctx.api.createForumTopic as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("Too many requests"))
      .mockResolvedValueOnce({ message_thread_id: 13 });

    await restoreCommand(ctx as never);

    expect(mocked.registerBindingMock).toHaveBeenCalledTimes(1);
    expect(ctx.reply).toHaveBeenLastCalledWith(
      expect.stringContaining(
        t("restore.result", { created: 1, skipped: 0, failed: 1 }),
      ),
      { message_thread_id: 1 },
    );
  });

  it("reports a server list failure instead of creating anything", async () => {
    mocked.listMock.mockResolvedValue({ data: null, error: new Error("down") });
    const ctx = createCommandContext();

    await restoreCommand(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith(t("restore.list_failed"), {
      message_thread_id: 1,
    });
    expect(ctx.api.createForumTopic).not.toHaveBeenCalled();
  });
});
