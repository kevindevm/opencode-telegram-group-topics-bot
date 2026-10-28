import { describe, expect, it, vi } from "vitest";
import { interactionManager } from "../../src/interaction/manager.js";

describe("interaction/manager expiry sweep", () => {
  it("purges TTL-elapsed scopes while keeping live ones", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

      interactionManager.start(
        { kind: "inline", expectedInput: "callback", expiresInMs: 1000 },
        "expired-scope",
      );
      interactionManager.start(
        { kind: "inline", expectedInput: "callback", expiresInMs: 60_000 },
        "live-scope",
      );
      interactionManager.start({ kind: "question", expectedInput: "callback" }, "no-ttl-scope");

      vi.advanceTimersByTime(1001);

      const purged = interactionManager.purgeExpired(Date.now());

      expect(purged).toEqual(["expired-scope"]);
      expect(interactionManager.isActive("expired-scope")).toBe(false);
      expect(interactionManager.isActive("live-scope")).toBe(true);
      expect(interactionManager.isActive("no-ttl-scope")).toBe(true);
    } finally {
      vi.useRealTimers();
    }

    interactionManager.clear("test_teardown", "live-scope");
    interactionManager.clear("test_teardown", "no-ttl-scope");
  });

  it("honors the excluded scope so the guard keeps its own expired reason", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

      interactionManager.start(
        { kind: "inline", expectedInput: "callback", expiresInMs: 1000 },
        "current-scope",
      );
      interactionManager.start(
        { kind: "inline", expectedInput: "callback", expiresInMs: 1000 },
        "other-scope",
      );

      vi.advanceTimersByTime(1001);

      const purged = interactionManager.purgeExpired(Date.now(), "current-scope");

      expect(purged).toEqual(["other-scope"]);
      expect(interactionManager.isExpired("current-scope")).toBe(true);
    } finally {
      vi.useRealTimers();
    }

    interactionManager.clear("test_teardown", "current-scope");
  });
});
