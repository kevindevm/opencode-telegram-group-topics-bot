import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => {
  const bindings = new Map<string, any>();

  return {
    bindings,
    unregisterSessionScopeMock: vi.fn(),
    getScopeForSessionMock: vi.fn(() => null),
  };
});

vi.mock("../../src/settings/manager.js", () => ({
  TOPIC_SESSION_STATUS: {
    ACTIVE: "active",
    CLOSED: "closed",
    STALE: "stale",
    ABANDONED: "abandoned",
    ERROR: "error",
  },
  clearTopicSessionBinding: vi.fn((bindingKey: string) => {
    mocked.bindings.delete(bindingKey);
  }),
  getCurrentProject: vi.fn(() => ({ id: "p1", worktree: "/repo" })),
  getScopedSessions: vi.fn(() => ({})),
  findTopicSessionBindingByScopeKey: vi.fn(() => undefined),
  findTopicSessionBindingBySessionId: vi.fn((sessionId: string) =>
    Array.from(mocked.bindings.values()).find((binding) => binding.sessionId === sessionId),
  ),
  getTopicSessionBinding: vi.fn((bindingKey: string) => mocked.bindings.get(bindingKey)),
  getTopicSessionBindings: vi.fn(() => Object.fromEntries(mocked.bindings.entries())),
  getTopicSessionBindingsByChat: vi.fn(() => []),
  setTopicSessionBinding: vi.fn((bindingKey: string, binding: unknown) => {
    mocked.bindings.set(bindingKey, binding);
  }),
  updateTopicSessionBindingStatus: vi.fn(),
}));

vi.mock("../../src/session/manager.js", () => ({
  getScopeForSession: mocked.getScopeForSessionMock,
  unregisterSessionScope: mocked.unregisterSessionScopeMock,
}));

vi.mock("../../src/bot/scope.js", () => ({
  SCOPE_CONTEXT: {
    DM: "dm",
    GROUP_GENERAL: "group-general",
    GROUP_TOPIC: "group-topic",
  },
  getScopeFromKey: vi.fn(() => null),
}));

import {
  __resetTopicManagerForTests,
  createTopicBindingKey,
  removeTopicBinding,
} from "../../src/topic/manager.js";

describe("topic/manager removeTopicBinding", () => {
  beforeEach(() => {
    mocked.bindings.clear();
    mocked.unregisterSessionScopeMock.mockClear();
    __resetTopicManagerForTests();
  });

  it("clears the binding and unregisters the session scope route", () => {
    mocked.bindings.set(createTopicBindingKey(-100, 11), {
      scopeKey: "-100:11",
      chatId: -100,
      threadId: 11,
      sessionId: "ses-1",
      projectId: "p1",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });

    removeTopicBinding(-100, 11);

    expect(mocked.bindings.get(createTopicBindingKey(-100, 11))).toBeUndefined();
    expect(mocked.unregisterSessionScopeMock).toHaveBeenCalledWith("ses-1", "-100:11");
  });

  it("is a no-op for unknown topics and never touches session routing", () => {
    removeTopicBinding(-100, 99);

    expect(mocked.unregisterSessionScopeMock).not.toHaveBeenCalled();
  });
});
