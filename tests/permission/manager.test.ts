import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PermissionRequest } from "../../src/permission/types.js";
import { permissionManager } from "../../src/permission/manager.js";

function createRequest(id: string): PermissionRequest {
  return {
    id,
    sessionID: "session-1",
    permission: "bash",
    patterns: ["npm test"],
    metadata: {},
    always: [],
  };
}

describe("permission/manager", () => {
  beforeEach(() => {
    permissionManager.clear();
    permissionManager.clear("other-scope");
  });

  it("lists scopes holding pending requests", () => {
    permissionManager.startPermission(createRequest("per-1"), 100, "global");
    permissionManager.startPermission(createRequest("per-2"), 200, "other-scope");

    expect(permissionManager.getActiveScopeKeys().sort()).toEqual(["global", "other-scope"]);
  });

  it("drops scopes once their requests are removed", () => {
    permissionManager.startPermission(createRequest("per-1"), 100, "global");
    permissionManager.startPermission(createRequest("per-2"), 200, "other-scope");
    permissionManager.removeByMessageId(200, "other-scope");

    expect(permissionManager.getActiveScopeKeys()).toEqual(["global"]);
  });

  it("returns an empty list without pending requests", () => {
    expect(permissionManager.getActiveScopeKeys()).toEqual([]);
  });

  it("keeps settled marks sticky within the TTL for duplicate deliveries", () => {
    permissionManager.markSettled("per-settled");

    expect(permissionManager.consumeSettled("per-settled")).toBe(true);
    expect(permissionManager.consumeSettled("per-settled")).toBe(true);
    expect(permissionManager.wasSettledRecently("per-settled")).toBe(true);
  });

  it("expires settled marks after the TTL", () => {
    vi.useFakeTimers();
    try {
      permissionManager.markSettled("per-old");

      expect(permissionManager.wasSettledRecently("per-old")).toBe(true);
      vi.advanceTimersByTime(6 * 60 * 1000);

      expect(permissionManager.wasSettledRecently("per-old")).toBe(false);
      expect(permissionManager.consumeSettled("per-old")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores unknown settled marks", () => {
    expect(permissionManager.consumeSettled("per-unknown")).toBe(false);
  });
});
