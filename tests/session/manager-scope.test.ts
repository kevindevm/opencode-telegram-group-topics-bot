import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetSessionManagerForTests,
  clearSession,
  getScopeForSession,
  getSessionById,
  registerSessionScope,
  setCurrentSession,
  unregisterSessionScope,
} from "../../src/session/manager.js";
import { __resetSettingsForTests, getCurrentSession } from "../../src/settings/manager.js";

describe("session/manager scope registry", () => {
  beforeEach(() => {
    __resetSettingsForTests();
    __resetSessionManagerForTests();
  });

  it("routes a bound session back to its scope", () => {
    setCurrentSession({ id: "ses-1", title: "One", directory: "/repo" }, "-100:11");

    expect(getScopeForSession("ses-1")).toBe("-100:11");
    expect(getSessionById("ses-1")?.id).toBe("ses-1");
  });

  it("registerSessionScope ignores mismatched ids instead of leaving a dangling route", () => {
    setCurrentSession({ id: "ses-1", title: "One", directory: "/repo" }, "-100:11");

    registerSessionScope("ses-other", "-100:11");

    expect(getScopeForSession("ses-other")).toBeNull();
    expect(getSessionById("ses-other")).toBeNull();
    // The original route is untouched.
    expect(getScopeForSession("ses-1")).toBe("-100:11");
  });

  it("unregisterSessionScope drops forward and reverse routes plus persisted state", () => {
    setCurrentSession({ id: "ses-1", title: "One", directory: "/repo" }, "-100:11");

    unregisterSessionScope("ses-1", "-100:11");

    expect(getScopeForSession("ses-1")).toBeNull();
    expect(getSessionById("ses-1")).toBeNull();
    expect(getCurrentSession("-100:11")).toBeUndefined();
  });

  it("unregisterSessionScope resolves the scope from the reverse map when omitted", () => {
    setCurrentSession({ id: "ses-1", title: "One", directory: "/repo" }, "-100:11");

    unregisterSessionScope("ses-1");

    expect(getScopeForSession("ses-1")).toBeNull();
    expect(getSessionById("ses-1")).toBeNull();
    expect(getCurrentSession("-100:11")).toBeUndefined();
  });

  it("clearSession removes routing in both directions", () => {
    setCurrentSession({ id: "ses-1", title: "One", directory: "/repo" }, "-100:11");

    clearSession("-100:11");

    expect(getScopeForSession("ses-1")).toBeNull();
    expect(getSessionById("ses-1")).toBeNull();
  });
});
