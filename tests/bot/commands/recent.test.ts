import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "grammy";
import { handleRecentSelect, recentCommand } from "../../../src/bot/commands/recent.js";
import { t } from "../../../src/i18n/index.js";

const mocked = vi.hoisted(() => ({
  loadRecentSessionsMock: vi.fn(),
  openSessionInNewTopicMock: vi.fn(),
  switchToProjectMock: vi.fn(),
  sessionGetMock: vi.fn(),
  getCurrentProjectMock: vi.fn(),
  setCurrentProjectMock: vi.fn(),
  setCurrentSessionMock: vi.fn(),
  summarySetSessionMock: vi.fn(),
  clearInteractionMock: vi.fn(),
  ensureActiveInlineMenuMock: vi.fn(() => Promise.resolve(true)),
  replyWithInlineMenuMock: vi.fn(),
}));

vi.mock("../../../src/session/recent.js", () => ({
  loadRecentSessions: mocked.loadRecentSessionsMock,
}));

vi.mock("../../../src/bot/commands/sessions.js", () => ({
  openSessionInNewTopic: mocked.openSessionInNewTopicMock,
}));

vi.mock("../../../src/bot/utils/switch-project.js", () => ({
  switchToProject: mocked.switchToProjectMock,
}));

vi.mock("../../../src/opencode/client.js", () => ({
  opencodeClient: {
    session: {
      get: mocked.sessionGetMock,
    },
  },
}));

vi.mock("../../../src/settings/manager.js", () => ({
  getCurrentProject: mocked.getCurrentProjectMock,
  setCurrentProject: mocked.setCurrentProjectMock,
}));

vi.mock("../../../src/session/manager.js", () => ({
  setCurrentSession: mocked.setCurrentSessionMock,
}));

vi.mock("../../../src/summary/aggregator.js", () => ({
  summaryAggregator: {
    clear: vi.fn(),
    setSession: mocked.summarySetSessionMock,
  },
}));

vi.mock("../../../src/interaction/cleanup.js", () => ({
  clearAllInteractionState: mocked.clearInteractionMock,
}));

vi.mock("../../../src/bot/handlers/inline-menu.js", () => ({
  ensureActiveInlineMenu: mocked.ensureActiveInlineMenuMock,
  replyWithInlineMenu: mocked.replyWithInlineMenuMock,
}));

const projectA = { id: "a", worktree: "/repo/a", name: "a" };

function entry(id: string, directory = "/repo/a") {
  return {
    id,
    title: `title-${id}`,
    directory,
    project: directory === projectA.worktree ? projectA : { id: "b", worktree: directory, name: "b" },
    updatedAt: 100,
    status: "idle" as const,
  };
}

function createCommandContext(privateChat = false): Context {
  return {
    chat: { id: privateChat ? 777 : -100123, type: privateChat ? "private" : "supergroup" },
    reply: vi.fn().mockResolvedValue({ message_id: 1 }),
    api: {
      sendMessage: vi.fn().mockResolvedValue({ message_id: 2 }),
    },
  } as unknown as Context;
}

function createCallbackContext(data: string): Context {
  return {
    chat: { id: -100123, type: "supergroup" },
    callbackQuery: { data },
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue({ message_id: 1 }),
    api: {
      sendMessage: vi.fn().mockResolvedValue({ message_id: 2 }),
    },
  } as unknown as Context;
}

describe("bot/commands/recent", () => {
  beforeEach(() => {
    mocked.loadRecentSessionsMock.mockReset();
    mocked.openSessionInNewTopicMock.mockReset();
    mocked.switchToProjectMock.mockReset();
    mocked.sessionGetMock.mockReset();
    mocked.getCurrentProjectMock.mockReset();
    mocked.setCurrentProjectMock.mockReset();
    mocked.setCurrentSessionMock.mockReset();
    mocked.summarySetSessionMock.mockReset();
    mocked.clearInteractionMock.mockReset();
    mocked.ensureActiveInlineMenuMock.mockReset();
    mocked.ensureActiveInlineMenuMock.mockResolvedValue(true);
    mocked.replyWithInlineMenuMock.mockReset();

    mocked.loadRecentSessionsMock.mockResolvedValue([entry("s1"), entry("s2")]);
    mocked.openSessionInNewTopicMock.mockResolvedValue(true);
    mocked.sessionGetMock.mockResolvedValue({
      data: { id: "s1", title: "title-s1" },
      error: undefined,
    });
    mocked.getCurrentProjectMock.mockReturnValue(projectA);
  });

  it("blocks usage inside a session topic", async () => {
    const ctx = createCommandContext();
    (ctx as { message?: unknown }).message = {
      message_thread_id: 5,
      is_topic_message: true,
    };

    await recentCommand(ctx as never);

    expect(mocked.loadRecentSessionsMock).not.toHaveBeenCalled();
  });

  it("answers empty when there are no recent sessions", async () => {
    mocked.loadRecentSessionsMock.mockResolvedValue([]);
    const ctx = createCommandContext();

    await recentCommand(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith(t("recent.empty"), expect.anything());
  });

  it("shows the recent menu", async () => {
    const ctx = createCommandContext();

    await recentCommand(ctx as never);

    expect(mocked.replyWithInlineMenuMock).toHaveBeenCalledTimes(1);
    const options = mocked.replyWithInlineMenuMock.mock.calls[0]?.[1] as {
      menuKind: string;
      text: string;
      keyboard: { inline_keyboard: Array<Array<{ text: string; callback_data?: string }>> };
    };
    expect(options.menuKind).toBe("recent");
    expect(options.text).toBe(t("recent.heading"));
    expect(options.keyboard.inline_keyboard[0]?.[0]?.callback_data).toBe("recent:s1");
  });

  it("ignores callbacks without the recent prefix", async () => {
    const ctx = createCallbackContext("session:s1");

    await expect(handleRecentSelect(ctx as never)).resolves.toBe(false);
  });

  it("selects the session in a DM without creating a topic", async () => {
    const ctx = createCallbackContext("recent:s1");
    (ctx as { chat?: unknown }).chat = { id: 777, type: "private" };

    await expect(handleRecentSelect(ctx as never)).resolves.toBe(true);

    expect(mocked.setCurrentSessionMock).toHaveBeenCalledWith(
      { id: "s1", title: "title-s1", directory: "/repo/a" },
      expect.anything(),
    );
    expect(mocked.openSessionInNewTopicMock).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(
      t("recent.selected", { title: "title-s1", project: "a" }),
      expect.anything(),
    );
  });

  it("opens the session in a new topic when it belongs to the current project", async () => {
    const ctx = createCallbackContext("recent:s1");

    await expect(handleRecentSelect(ctx as never)).resolves.toBe(true);

    expect(mocked.switchToProjectMock).not.toHaveBeenCalled();
    expect(mocked.openSessionInNewTopicMock).toHaveBeenCalledTimes(1);
  });

  it("switches projects before opening a foreign session topic", async () => {
    mocked.loadRecentSessionsMock.mockResolvedValue([entry("s9", "/repo/b")]);
    mocked.sessionGetMock.mockResolvedValue({
      data: { id: "s9", title: "title-s9" },
      error: undefined,
    });
    const ctx = createCallbackContext("recent:s9");

    await expect(handleRecentSelect(ctx as never)).resolves.toBe(true);

    expect(mocked.switchToProjectMock).toHaveBeenCalledTimes(1);
    expect(mocked.openSessionInNewTopicMock).toHaveBeenCalledTimes(1);
  });

  it("adopts the entry project when none is selected", async () => {
    mocked.getCurrentProjectMock.mockReturnValue(null);
    const ctx = createCallbackContext("recent:s1");

    await expect(handleRecentSelect(ctx as never)).resolves.toBe(true);

    expect(mocked.switchToProjectMock).toHaveBeenCalledTimes(1);
    expect(mocked.openSessionInNewTopicMock).toHaveBeenCalledTimes(1);
    expect(ctx.reply).not.toHaveBeenCalledWith(
      t("sessions.select_project_first"),
      expect.anything(),
    );
  });
});
