import { describe, expect, it } from "vitest";
import { buildSessionRetryMessage, formatRetryWait } from "../../../src/bot/utils/retry-message.js";

const NOW = 1_700_000_000_000;

describe("bot/utils/retry-message", () => {
  describe("formatRetryWait", () => {
    it("rounds sub-second waits up to one second", () => {
      expect(formatRetryWait(500)).toBe("1s");
    });

    it("formats seconds below a minute", () => {
      expect(formatRetryWait(45_000)).toBe("45s");
      expect(formatRetryWait(59_000)).toBe("59s");
    });

    it("formats whole minutes without remainder", () => {
      expect(formatRetryWait(60_000)).toBe("1m");
      expect(formatRetryWait(120_000)).toBe("2m");
    });

    it("formats minutes with remainder", () => {
      expect(formatRetryWait(90_000)).toBe("1m 30s");
      expect(formatRetryWait(61_000)).toBe("1m 1s");
    });
  });

  describe("buildSessionRetryMessage", () => {
    it("shows the countdown from a millisecond timestamp", () => {
      const text = buildSessionRetryMessage({
        message: "Rate limit exceeded. Please try again later.",
        next: NOW + 45_000,
        now: NOW,
      });

      expect(text).toContain("Rate limit exceeded");
      expect(text).toContain("45s");
    });

    it("reads second timestamps as seconds", () => {
      const text = buildSessionRetryMessage({
        message: "Rate limit exceeded.",
        next: NOW / 1000 + 30,
        now: NOW,
      });

      expect(text).toContain("30s");
    });

    it("falls back to the generic text without a future timestamp", () => {
      for (const next of [undefined, NOW - 1000, NaN, -5]) {
        const text = buildSessionRetryMessage({ message: "boom", next, now: NOW });

        expect(text).toContain("boom");
        expect(text).not.toContain("⏳");
      }
    });

    it("falls back to the unknown error text for blank messages", () => {
      const text = buildSessionRetryMessage({ message: "   ", next: NOW + 5000, now: NOW });

      expect(text).toContain("5s");
    });

    it("truncates long messages", () => {
      const text = buildSessionRetryMessage({
        message: "x".repeat(100),
        next: NOW + 5000,
        now: NOW,
        maxLength: 20,
      });

      expect(text).toContain(`${"x".repeat(17)}...`);
    });
  });
});
