import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PermissionRequest } from "../../../src/permission/types.js";
import {
  __resetScheduledPermissionPollsForTests,
  schedulePermissionPoll,
} from "../../../src/bot/handlers/permission.js";
import { setTrustLevel, __resetTrustForTests } from "../../../src/permission/trust.js";
import { permissionManager } from "../../../src/permission/manager.js";

const mocked = vi.hoisted(() => ({
  permissionReplyMock: vi.fn(),
}));

vi.mock("../../../src/opencode/client.js", () => ({
  opencodeClient: {
    permission: {
      reply: mocked.permissionReplyMock,
    },
  },
}));

vi.mock("../../../src/settings/manager.js", () => ({
  getCurrentProject: vi.fn(() => ({ id: "project-1", worktree: "D:/repo" })),
}));

vi.mock("../../../src/session/manager.js", () => ({
  getCurrentSession: vi.fn(() => ({ id: "session-1", title: "S", directory: "D:/repo" })),
  getSessionById: vi.fn(() => null),
}));

function createRequest(id: string, permission: string): PermissionRequest {
  return {
    id,
    sessionID: "session-1",
    permission,
    patterns: ["src/a.ts"],
    metadata: {},
    always: [],
  };
}

const botApi = { sendMessage: vi.fn() } as never;

describe("permission trust auto-approve", () => {
  beforeEach(() => {
    mocked.permissionReplyMock.mockReset().mockResolvedValue({ error: null });
    botApi.sendMessage.mockReset?.();
    __resetTrustForTests();
    __resetScheduledPermissionPollsForTests();
    permissionManager.__resetForTests();
  });

  it("auto-approves file edits without showing a poll", async () => {
    setTrustLevel("session-1", "edits");

    schedulePermissionPoll(botApi, 777, createRequest("req-edit", "edit"), "scope-1", null);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mocked.permissionReplyMock).toHaveBeenCalledWith(
      expect.objectContaining({ requestID: "req-edit", reply: "once" }),
    );
  });

  it("still polls bash at the edits level", async () => {
    setTrustLevel("session-1", "edits");

    schedulePermissionPoll(botApi, 777, createRequest("req-bash", "bash"), "scope-1", null);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mocked.permissionReplyMock).not.toHaveBeenCalled();
  });

  it("auto-approves everything at the all level", async () => {
    setTrustLevel("session-1", "all");

    schedulePermissionPoll(botApi, 777, createRequest("req-bash", "bash"), "scope-1", null);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mocked.permissionReplyMock).toHaveBeenCalledWith(
      expect.objectContaining({ requestID: "req-bash", reply: "once" }),
    );
  });

  it("polls normally without trust", async () => {
    schedulePermissionPoll(botApi, 777, createRequest("req-edit", "edit"), "scope-1", null);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mocked.permissionReplyMock).not.toHaveBeenCalled();
  });
});
