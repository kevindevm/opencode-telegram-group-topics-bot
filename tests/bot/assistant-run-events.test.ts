import { beforeEach, describe, expect, it, vi } from "vitest";
import { assistantRunState } from "../../src/bot/assistant-run-state.js";
import {
  ensureAssistantRunForLiveEvent,
  ensureAssistantRunForTokens,
} from "../../src/bot/assistant-run-events.js";
import { __resetSettingsForTests, setCurrentModel } from "../../src/settings/manager.js";

const mocked = vi.hoisted(() => ({
  getTopicBindingBySessionIdMock: vi.fn(),
}));

vi.mock("../../src/topic/manager.js", () => ({
  getTopicBindingBySessionId: mocked.getTopicBindingBySessionIdMock,
}));

const ACTIVE_BINDING = {
  scopeKey: "-100:178",
  chatId: -100,
  threadId: 178,
  sessionId: "ses-1",
  projectId: "p1",
  status: "active",
};

function busyEvent(sessionId: string): { type: string; properties: unknown } {
  return {
    type: "session.status",
    properties: { sessionID: sessionId, status: { type: "busy" } },
  };
}

describe("bot/assistant-run-events", () => {
  beforeEach(() => {
    __resetSettingsForTests();
    assistantRunState.__resetForTests();
    mocked.getTopicBindingBySessionIdMock.mockReset();
    mocked.getTopicBindingBySessionIdMock.mockReturnValue(undefined);
    setCurrentModel({ providerID: "openai", modelID: "gpt-5", variant: "default" }, "-100:178");
  });

  it("opens a run clock when a bound session goes busy without one", () => {
    mocked.getTopicBindingBySessionIdMock.mockReturnValue(ACTIVE_BINDING);

    ensureAssistantRunForLiveEvent(busyEvent("ses-1"));

    const run = assistantRunState.getRun("ses-1");
    expect(run).toMatchObject({
      sessionId: "ses-1",
      configuredProviderID: "openai",
      configuredModelID: "gpt-5",
    });
    expect(typeof run?.startedAt).toBe("number");
  });

  it("never restarts the clock of an existing run", () => {
    mocked.getTopicBindingBySessionIdMock.mockReturnValue(ACTIVE_BINDING);
    assistantRunState.startRun("ses-1", {
      startedAt: 1111,
      configuredAgent: "plan",
      configuredProviderID: "openai",
      configuredModelID: "gpt-5",
    });

    ensureAssistantRunForLiveEvent(busyEvent("ses-1"));

    expect(assistantRunState.getRun("ses-1")).toMatchObject({
      startedAt: 1111,
      configuredAgent: "plan",
    });
  });

  it("ignores idle statuses, unrelated events and unbound sessions", () => {
    mocked.getTopicBindingBySessionIdMock.mockReturnValue(ACTIVE_BINDING);

    ensureAssistantRunForLiveEvent({
      type: "session.status",
      properties: { sessionID: "ses-1", status: { type: "idle" } },
    });
    ensureAssistantRunForLiveEvent({ type: "message.updated", properties: {} });
    expect(assistantRunState.getRun("ses-1")).toBeNull();

    mocked.getTopicBindingBySessionIdMock.mockReturnValue(undefined);
    ensureAssistantRunForLiveEvent(busyEvent("ses-9"));
    expect(assistantRunState.getRun("ses-9")).toBeNull();
  });

  it("skips ephemeral and closed bindings", () => {
    mocked.getTopicBindingBySessionIdMock.mockReturnValue({
      ...ACTIVE_BINDING,
      ephemeral: true,
    });
    ensureAssistantRunForLiveEvent(busyEvent("ses-1"));
    expect(assistantRunState.getRun("ses-1")).toBeNull();

    mocked.getTopicBindingBySessionIdMock.mockReturnValue({
      ...ACTIVE_BINDING,
      ephemeral: undefined,
      status: "closed",
    });
    ensureAssistantRunForLiveEvent(busyEvent("ses-1"));
    expect(assistantRunState.getRun("ses-1")).toBeNull();
  });

  it("opens a run clock for tokens arriving without one", () => {
    ensureAssistantRunForTokens("ses-7", "-100:178");

    expect(assistantRunState.getRun("ses-7")).toMatchObject({
      sessionId: "ses-7",
      configuredProviderID: "openai",
      configuredModelID: "gpt-5",
    });
  });

  it("keeps the existing run when tokens arrive", () => {
    assistantRunState.startRun("ses-7", { startedAt: 2222 });

    ensureAssistantRunForTokens("ses-7", "-100:178");

    expect(assistantRunState.getRun("ses-7")).toMatchObject({ startedAt: 2222 });
  });
});
