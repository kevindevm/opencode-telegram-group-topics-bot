import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "grammy";
import {
  MODEL_SEARCH_AGAIN_CALLBACK,
  MODEL_SEARCH_CALLBACK,
  MODEL_SEARCH_CANCEL_CALLBACK,
  handleModelSearchTextAnswer,
  handleModelSelect,
} from "../../../src/bot/handlers/model.js";

const mocked = vi.hoisted(() => ({
  searchModelsMock: vi.fn(),
  addFavoriteModelMock: vi.fn(),
  removeFavoriteModelMock: vi.fn(),
  getFavoriteModelsMock: vi.fn(async () => []),
  selectModelMock: vi.fn(),
  fetchCurrentModelMock: vi.fn(),
  getModelSelectionListsMock: vi.fn(),
  formatVariantForButtonMock: vi.fn((variant: string) => variant),
  getStoredAgentMock: vi.fn(() => "build"),
  resolveProjectAgentMock: vi.fn(async (agent: string) => agent),
  pinnedRefreshContextLimitMock: vi.fn(),
  pinnedGetContextInfoMock: vi.fn(() => null),
  pinnedGetContextLimitMock: vi.fn(() => 0),
  keyboardInitializeMock: vi.fn(),
  keyboardUpdateModelMock: vi.fn(),
  keyboardUpdateContextMock: vi.fn(),
  keyboardUpdateAgentMock: vi.fn(),
  keyboardGetContextInfoMock: vi.fn(() => null),
  ensureActiveInlineMenuMock: vi.fn(async () => true),
  clearActiveInlineMenuMock: vi.fn(),
  interactionGetSnapshotMock: vi.fn(),
  interactionStartMock: vi.fn(),
  interactionTransitionMock: vi.fn(),
  interactionClearMock: vi.fn(),
}));

vi.mock("../../../src/model/manager.js", () => ({
  searchModels: mocked.searchModelsMock,
  addFavoriteModel: mocked.addFavoriteModelMock,
  removeFavoriteModel: mocked.removeFavoriteModelMock,
  getFavoriteModels: mocked.getFavoriteModelsMock,
  selectModel: mocked.selectModelMock,
  fetchCurrentModel: mocked.fetchCurrentModelMock,
  getModelSelectionLists: mocked.getModelSelectionListsMock,
}));

vi.mock("../../../src/variant/manager.js", () => ({
  formatVariantForButton: mocked.formatVariantForButtonMock,
}));

vi.mock("../../../src/agent/manager.js", () => ({
  getStoredAgent: mocked.getStoredAgentMock,
  resolveProjectAgent: mocked.resolveProjectAgentMock,
}));

vi.mock("../../../src/pinned/manager.js", () => ({
  pinnedMessageManager: {
    refreshContextLimit: mocked.pinnedRefreshContextLimitMock,
    getContextInfo: mocked.pinnedGetContextInfoMock,
    getContextLimit: mocked.pinnedGetContextLimitMock,
    getState: vi.fn(() => ({})),
    onSessionChange: vi.fn(),
  },
}));

vi.mock("../../../src/keyboard/manager.js", () => ({
  keyboardManager: {
    initialize: mocked.keyboardInitializeMock,
    updateModel: mocked.keyboardUpdateModelMock,
    updateContext: mocked.keyboardUpdateContextMock,
    updateAgent: mocked.keyboardUpdateAgentMock,
    getContextInfo: mocked.keyboardGetContextInfoMock,
  },
}));

vi.mock("../../../src/bot/handlers/inline-menu.js", () => ({
  ensureActiveInlineMenu: mocked.ensureActiveInlineMenuMock,
  clearActiveInlineMenu: mocked.clearActiveInlineMenuMock,
  replyWithInlineMenu: vi.fn(),
  appendInlineMenuCancelButton: (keyboard: unknown) => keyboard,
}));

vi.mock("../../../src/interaction/manager.js", () => ({
  interactionManager: {
    getSnapshot: mocked.interactionGetSnapshotMock,
    start: mocked.interactionStartMock,
    transition: mocked.interactionTransitionMock,
    clear: mocked.interactionClearMock,
  },
}));

vi.mock("../../../src/utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

function createMessageContext(text: string): Context {
  return {
    chat: { id: 111, type: "supergroup" },
    message: { text, message_id: 10, message_thread_id: 777 },
    reply: vi.fn().mockResolvedValue({ message_id: 456 }),
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    deleteMessage: vi.fn().mockResolvedValue(undefined),
    editMessageText: vi.fn().mockResolvedValue(undefined),
    api: {},
  } as unknown as Context;
}

function createCallbackContext(data: string, messageId: number): Context {
  return {
    chat: { id: 111, type: "supergroup" },
    callbackQuery: {
      data,
      message: {
        message_id: messageId,
        message_thread_id: 777,
      },
    } as Context["callbackQuery"],
    reply: vi.fn().mockResolvedValue({ message_id: 456 }),
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    deleteMessage: vi.fn().mockResolvedValue(undefined),
    editMessageText: vi.fn().mockResolvedValue(undefined),
    editMessageReplyMarkup: vi.fn().mockResolvedValue(true),
    api: {},
  } as unknown as Context;
}

function queryStageSnapshot() {
  return {
    kind: "custom",
    expectedInput: "text",
    allowedCommands: [],
    metadata: { flow: "model-search", stage: "query" },
    createdAt: 0,
    expiresAt: null,
  };
}

function resultsStageSnapshot() {
  return {
    kind: "custom",
    expectedInput: "callback",
    allowedCommands: [],
    metadata: {
      flow: "model-search",
      stage: "results",
      query: "gpt",
      messageId: 456,
      models: [
        { providerID: "openai", modelID: "gpt-4o" },
        { providerID: "openai", modelID: "gpt-3.5" },
      ],
    },
    createdAt: 0,
    expiresAt: null,
  };
}

function getCallbackDataList(ctx: Context): string[] {
  const reply = ctx.reply as ReturnType<typeof vi.fn>;
  const keyboard = reply.mock.calls[0]?.[1]?.reply_markup as
    | { inline_keyboard: Array<Array<{ callback_data?: string }>> }
    | undefined;
  return (keyboard?.inline_keyboard ?? [])
    .flat()
    .map((button) => button.callback_data ?? "");
}

function getButtonTextList(ctx: Context): string[] {
  const reply = ctx.reply as ReturnType<typeof vi.fn>;
  const keyboard = reply.mock.calls[0]?.[1]?.reply_markup as
    | { inline_keyboard: Array<Array<{ text?: string }>> }
    | undefined;
  return (keyboard?.inline_keyboard ?? []).flat().map((button) => button.text ?? "");
}

describe("bot/handlers/model-search", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocked)) {
      if (typeof mock === "function" && "mockReset" in mock) {
        (mock as ReturnType<typeof vi.fn>).mockReset();
      }
    }

    mocked.ensureActiveInlineMenuMock.mockResolvedValue(true);
    mocked.fetchCurrentModelMock.mockReturnValue({
      providerID: "openai",
      modelID: "gpt-4o",
      variant: "default",
    });
    mocked.interactionGetSnapshotMock.mockReturnValue(null);
    mocked.searchModelsMock.mockResolvedValue([
      { providerID: "openai", modelID: "gpt-4o" },
      { providerID: "openai", modelID: "gpt-3.5" },
    ]);
  });

  it("starts the search flow from the menu button", async () => {
    const ctx = createCallbackContext(MODEL_SEARCH_CALLBACK, 5);

    const handled = await handleModelSelect(ctx);

    expect(handled).toBe(true);
    expect(mocked.interactionStartMock).toHaveBeenCalledWith(
      {
        kind: "custom",
        expectedInput: "text",
        metadata: { flow: "model-search", stage: "query", messageId: expect.any(Number) },
      },
      expect.any(String),
    );
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("search"),
      expect.objectContaining({ reply_markup: expect.anything() }),
    );
    expect(ctx.deleteMessage).toHaveBeenCalled();
  });

  it("searches on query text and shows result buttons", async () => {
    mocked.interactionGetSnapshotMock.mockReturnValue(queryStageSnapshot());
    const ctx = createMessageContext("gpt");

    const handled = await handleModelSearchTextAnswer(ctx);

    expect(handled).toBe(true);
    expect(mocked.searchModelsMock).toHaveBeenCalledWith("gpt");
    expect(mocked.interactionTransitionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedInput: "callback",
        metadata: expect.objectContaining({ stage: "results", query: "gpt" }),
      }),
      expect.any(String),
    );
    const callbacks = getCallbackDataList(ctx);
    expect(callbacks).toContain("model:result:0");
    expect(callbacks).toContain("model:result:1");
    expect(callbacks).toContain(MODEL_SEARCH_AGAIN_CALLBACK);
    expect(callbacks).toContain(MODEL_SEARCH_CANCEL_CALLBACK);
  });

  it("replies no-results and stays in query stage", async () => {
    mocked.interactionGetSnapshotMock.mockReturnValue(queryStageSnapshot());
    mocked.searchModelsMock.mockResolvedValue([]);
    const ctx = createMessageContext("zzz-no-match");

    const handled = await handleModelSearchTextAnswer(ctx);

    expect(handled).toBe(true);
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("zzz-no-match"),
      expect.anything(),
    );
    expect(mocked.interactionTransitionMock).not.toHaveBeenCalled();
  });

  it("ignores text outside the query stage", async () => {
    mocked.interactionGetSnapshotMock.mockReturnValue(null);

    expect(await handleModelSearchTextAnswer(createMessageContext("gpt"))).toBe(false);
    expect(mocked.searchModelsMock).not.toHaveBeenCalled();
  });

  it("ignores command text during the query stage", async () => {
    mocked.interactionGetSnapshotMock.mockReturnValue(queryStageSnapshot());

    expect(await handleModelSearchTextAnswer(createMessageContext("/new"))).toBe(false);
    expect(mocked.searchModelsMock).not.toHaveBeenCalled();
  });

  it("picks a result and selects the model", async () => {
    mocked.interactionGetSnapshotMock.mockReturnValue(resultsStageSnapshot());
    const ctx = createCallbackContext("model:result:1", 456);

    const handled = await handleModelSelect(ctx);

    expect(handled).toBe(true);
    expect(mocked.selectModelMock).toHaveBeenCalledWith(
      { providerID: "openai", modelID: "gpt-3.5", variant: "default" },
      expect.any(String),
    );
    expect(mocked.interactionClearMock).toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("gpt-3.5"),
      expect.anything(),
    );
    expect(ctx.deleteMessage).toHaveBeenCalled();
  });

  it("rejects an out-of-range result index", async () => {
    mocked.interactionGetSnapshotMock.mockReturnValue(resultsStageSnapshot());
    const ctx = createCallbackContext("model:result:9", 456);

    const handled = await handleModelSelect(ctx);

    expect(handled).toBe(true);
    expect(mocked.selectModelMock).not.toHaveBeenCalled();
    expect(ctx.answerCallbackQuery).toHaveBeenCalled();
  });

  it("rejects picks from a stale results message", async () => {
    mocked.interactionGetSnapshotMock.mockReturnValue(resultsStageSnapshot());
    const ctx = createCallbackContext("model:result:0", 123);

    const handled = await handleModelSelect(ctx);

    expect(handled).toBe(true);
    expect(mocked.selectModelMock).not.toHaveBeenCalled();
  });

  it("cancels the search flow", async () => {
    mocked.interactionGetSnapshotMock.mockReturnValue(queryStageSnapshot());
    const ctx = createCallbackContext(MODEL_SEARCH_CANCEL_CALLBACK, 456);

    const handled = await handleModelSelect(ctx);

    expect(handled).toBe(true);
    expect(mocked.interactionClearMock).toHaveBeenCalled();
    expect(ctx.editMessageText).toHaveBeenCalled();
  });

  it("ignores cancel without an active search", async () => {
    mocked.interactionGetSnapshotMock.mockReturnValue(null);
    const ctx = createCallbackContext(MODEL_SEARCH_CANCEL_CALLBACK, 456);

    expect(await handleModelSelect(ctx)).toBe(false);
    expect(mocked.interactionClearMock).not.toHaveBeenCalled();
  });

  it("shows short model labels that fit next to the star toggle", async () => {
    mocked.interactionGetSnapshotMock.mockReturnValue(queryStageSnapshot());
    mocked.searchModelsMock.mockResolvedValue([
      { providerID: "opencode", modelID: "muse-spark-1.3-contributor" },
      { providerID: "opencode-go", modelID: "muse-spark-1.3-contributor" },
    ]);
    const ctx = createMessageContext("muse");

    await handleModelSearchTextAnswer(ctx);

    const texts = getButtonTextList(ctx);
    expect(texts).toContain("muse-spark-1.3-contributor • opencode");
    expect(texts).toContain("muse-spark-1.3-contributor • opencode-go");
    expect(texts.some((text) => text.includes("/"))).toBe(false);
  });

  it("shows model ids without provider when there are no duplicates", async () => {
    mocked.interactionGetSnapshotMock.mockReturnValue(queryStageSnapshot());
    const ctx = createMessageContext("gpt");

    await handleModelSearchTextAnswer(ctx);

    const texts = getButtonTextList(ctx);
    expect(texts).toContain("✅ gpt-4o");
    expect(texts).toContain("gpt-3.5");
  });

  it("shows a star button per result that toggles the favorite", async () => {
    mocked.interactionGetSnapshotMock.mockReturnValue(queryStageSnapshot());
    const ctx = createMessageContext("gpt");

    await handleModelSearchTextAnswer(ctx);

    const callbacks = getCallbackDataList(ctx);
    expect(callbacks).toContain("model:fav:0");
    expect(callbacks).toContain("model:fav:1");
  });

  it("adds a favorite and refreshes the buttons", async () => {
    mocked.interactionGetSnapshotMock.mockReturnValue(resultsStageSnapshot());
    mocked.addFavoriteModelMock.mockResolvedValue(true);
    mocked.getFavoriteModelsMock.mockResolvedValue([]);
    const ctx = createCallbackContext("model:fav:1", 456);

    const handled = await handleModelSelect(ctx);

    expect(handled).toBe(true);
    expect(mocked.addFavoriteModelMock).toHaveBeenCalledWith({
      providerID: "openai",
      modelID: "gpt-3.5",
    });
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith({
      text: expect.stringContaining("favorit"),
    });
    expect(ctx.editMessageReplyMarkup).toHaveBeenCalled();
    // stays in results stage for further picks
    expect(mocked.interactionClearMock).not.toHaveBeenCalled();
  });

  it("removes a favorite that is already starred", async () => {
    mocked.interactionGetSnapshotMock.mockReturnValue(resultsStageSnapshot());
    mocked.getFavoriteModelsMock.mockResolvedValue([
      { providerID: "openai", modelID: "gpt-4o" },
    ]);
    mocked.removeFavoriteModelMock.mockResolvedValue(true);
    const ctx = createCallbackContext("model:fav:0", 456);

    const handled = await handleModelSelect(ctx);

    expect(handled).toBe(true);
    expect(mocked.removeFavoriteModelMock).toHaveBeenCalledWith("openai", "gpt-4o");
    expect(mocked.addFavoriteModelMock).not.toHaveBeenCalled();
    expect(ctx.editMessageReplyMarkup).toHaveBeenCalled();
  });

  it("rejects favorite toggles with stale message ids", async () => {
    mocked.interactionGetSnapshotMock.mockReturnValue(resultsStageSnapshot());
    const ctx = createCallbackContext("model:fav:0", 123);

    const handled = await handleModelSelect(ctx);

    expect(handled).toBe(true);
    expect(mocked.addFavoriteModelMock).not.toHaveBeenCalled();
    expect(mocked.removeFavoriteModelMock).not.toHaveBeenCalled();
  });

  it("rejects out-of-range favorite indexes", async () => {
    mocked.interactionGetSnapshotMock.mockReturnValue(resultsStageSnapshot());
    const ctx = createCallbackContext("model:fav:9", 456);

    const handled = await handleModelSelect(ctx);

    expect(handled).toBe(true);
    expect(mocked.addFavoriteModelMock).not.toHaveBeenCalled();
  });
});
