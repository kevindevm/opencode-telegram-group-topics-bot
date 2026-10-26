import { beforeEach, describe, expect, it } from "vitest";
import {
  TRUST_LEVEL,
  clearTrustLevel,
  getTrustLevel,
  isAutoAllowed,
  isTrustLevel,
  setTrustLevel,
  __resetTrustForTests,
} from "../../src/permission/trust.js";

describe("permission/trust", () => {
  beforeEach(() => {
    __resetTrustForTests();
  });

  it("defaults to ask", () => {
    expect(getTrustLevel("ses-1")).toBe("ask");
  });

  it("stores and clears levels", () => {
    setTrustLevel("ses-1", TRUST_LEVEL.ALL);
    expect(getTrustLevel("ses-1")).toBe("all");

    setTrustLevel("ses-1", TRUST_LEVEL.ASK);
    expect(getTrustLevel("ses-1")).toBe("ask");

    setTrustLevel("ses-1", TRUST_LEVEL.EDITS);
    clearTrustLevel("ses-1");
    expect(getTrustLevel("ses-1")).toBe("ask");
  });

  it("validates level names", () => {
    expect(isTrustLevel("ask")).toBe(true);
    expect(isTrustLevel("edits")).toBe(true);
    expect(isTrustLevel("all")).toBe(true);
    expect(isTrustLevel("everything")).toBe(false);
  });

  it("auto-allows everything at all, nothing at ask", () => {
    expect(isAutoAllowed(TRUST_LEVEL.ALL, "bash")).toBe(true);
    expect(isAutoAllowed(TRUST_LEVEL.ALL, "edit")).toBe(true);
    expect(isAutoAllowed(TRUST_LEVEL.ASK, "edit")).toBe(false);
  });

  it("auto-allows reads and file mutations at edits, not bash", () => {
    for (const permission of ["read", "glob", "grep", "list", "edit", "write", "apply_patch"]) {
      expect(isAutoAllowed(TRUST_LEVEL.EDITS, permission)).toBe(true);
    }

    expect(isAutoAllowed(TRUST_LEVEL.EDITS, "bash")).toBe(false);
    expect(isAutoAllowed(TRUST_LEVEL.EDITS, "task")).toBe(false);
    expect(isAutoAllowed(TRUST_LEVEL.EDITS, "webfetch")).toBe(false);
  });
});
