import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "grammy";

const mocked = vi.hoisted(() => ({
  sessionAbortMock: vi.fn(),
  sessionStatusMock: vi.fn(),
  getCurrentSessionMock: vi.fn(),
  interactionSnapshotMock: vi.fn(() => null),
  clearAllInteractionStateMock: vi.fn(),
  clearSessionMock: vi.fn(),
  updateBindingStatusMock: vi.fn(),
  clearPromptResponseModeMock: vi.fn(),
  cancelScheduledPermissionPollsMock: vi.fn(),
}));

vi.mock("../../../src/opencode/client.js", () => ({
  opencodeClient: {
    session: {
      abort: mocked.sessionAbortMock,
      status: mocked.sessionStatusMock,
    },
  },
}));

vi.mock("../../../src/session/manager.js", () => ({
  getCurrentSession: mocked.getCurrentSessionMock,
}));

vi.mock("../../../src/interaction/manager.js", () => ({
  interactionManager: {
    getSnapshot: mocked.interactionSnapshotMock,
    clear: vi.fn(),
  },
}));

vi.mock("../../../src/interaction/cleanup.js", () => ({
  clearAllInteractionState: mocked.clearAllInteractionStateMock,
}));

vi.mock("../../../src/summary/aggregator.js", () => ({
  summaryAggregator: {
    clear: vi.fn(),
    clearSession: mocked.clearSessionMock,
  },
}));

vi.mock("../../../src/topic/manager.js", () => ({
  updateTopicBindingStatusBySessionId: mocked.updateBindingStatusMock,
}));

vi.mock("../../../src/settings/manager.js", () => ({
  TOPIC_SESSION_STATUS: { ABANDONED: "abandoned" },
}));

vi.mock("../../../src/bot/handlers/prompt.js", () => ({
  clearPromptResponseMode: mocked.clearPromptResponseModeMock,
}));

vi.mock("../../../src/bot/handlers/permission.js", () => ({
  cancelAllScheduledPermissionPolls: mocked.cancelScheduledPermissionPollsMock,
}));

vi.mock("../../../src/utils/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { abortCommand } from "../../../src/bot/commands/abort.js";
import { assistantRunState } from "../../../src/bot/assistant-run-state.js";
import { t } from "../../../src/i18n/index.js";

function createContext(): Context {
  return {
    chat: { id: -100123, type: "supergroup" },
    message: { text: "/abort", message_thread_id: 555 },
    reply: vi.fn().mockResolvedValue({ message_id: 7 }),
    api: {
      editMessageText: vi.fn().mockResolvedValue(true),
    },
  } as unknown as Context;
}

describe("bot/commands/abort", () => {
  beforeEach(() => {
    assistantRunState.__resetForTests();
    mocked.sessionAbortMock.mockReset().mockResolvedValue({ data: true, error: null });
    mocked.sessionStatusMock.mockReset().mockResolvedValue({
      data: { "session-1": { type: "idle" } },
      error: null,
    });
    mocked.getCurrentSessionMock.mockReset().mockReturnValue({
      id: "session-1",
      title: "Session",
      directory: "/repo/app",
    });
    mocked.interactionSnapshotMock.mockReset().mockReturnValue(null);
    mocked.clearAllInteractionStateMock.mockReset();
    mocked.clearSessionMock.mockReset();
    mocked.updateBindingStatusMock.mockReset();
    mocked.clearPromptResponseModeMock.mockReset();
    mocked.cancelScheduledPermissionPollsMock.mockReset();
  });

  it("clears the assistant run and pending permission polls for the aborted scope", async () => {
    assistantRunState.startRun("session-1", { startedAt: Date.now() });
    const ctx = createContext();

    await abortCommand(ctx as never);

    expect(mocked.cancelScheduledPermissionPollsMock).toHaveBeenCalledWith("-100123:555");
    expect(mocked.clearPromptResponseModeMock).toHaveBeenCalledWith("session-1");
    expect(assistantRunState.getRun("session-1")).toBeNull();
    expect(ctx.api.editMessageText).toHaveBeenCalledWith(
      -100123,
      7,
      t("stop.success"),
    );
  });

  it("clears interaction state without a session", async () => {
    mocked.getCurrentSessionMock.mockReturnValue(undefined);
    const ctx = createContext();

    await abortCommand(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith(t("stop.no_active_session"), {
      message_thread_id: 555,
    });
    expect(mocked.sessionAbortMock).not.toHaveBeenCalled();
  });
});
