import { describe, expect, it } from "vitest";
import { permissionManager } from "../../src/permission/manager.js";
import type { PermissionRequest } from "../../src/permission/types.js";

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

describe("permission/manager scope hygiene", () => {
  it("does not materialize scope entries on read-only access", () => {
    expect(permissionManager.isActive("ghost-perm-scope")).toBe(false);
    expect(permissionManager.getPendingCount("ghost-perm-scope")).toBe(0);
    expect(permissionManager.getMessageIds("ghost-perm-scope")).toEqual([]);
    expect(permissionManager.getRequest(1, "ghost-perm-scope")).toBeNull();
    expect(permissionManager.isActiveMessage(1, "ghost-perm-scope")).toBe(false);

    expect(permissionManager.getActiveScopeKeys()).not.toContain("ghost-perm-scope");
  });

  it("drops the scope entry once its last request is removed", () => {
    permissionManager.startPermission(createRequest("perm-hygiene"), 701, "hygiene-perm-scope");
    expect(permissionManager.getActiveScopeKeys()).toContain("hygiene-perm-scope");

    permissionManager.removeByMessageId(701, "hygiene-perm-scope");

    expect(permissionManager.isActive("hygiene-perm-scope")).toBe(false);
    expect(permissionManager.getActiveScopeKeys()).not.toContain("hygiene-perm-scope");
  });

  it("clear() deletes the scope entry instead of keeping an empty one", () => {
    permissionManager.startPermission(createRequest("perm-hygiene-2"), 702, "hygiene-perm-scope-2");

    permissionManager.clear("hygiene-perm-scope-2");

    expect(permissionManager.getActiveScopeKeys()).not.toContain("hygiene-perm-scope-2");
    expect(permissionManager.getPendingCount("hygiene-perm-scope-2")).toBe(0);
  });
});
