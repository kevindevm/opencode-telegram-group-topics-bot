import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  TRUST_LEVEL,
  __resetTrustForTests,
  getTrustLevel,
  setTrustLevel,
} from "../../src/permission/trust.js";

describe("permission/trust hygiene", () => {
  beforeEach(() => {
    __resetTrustForTests();
  });

  it("drops expired entries on read instead of keeping dead sessions", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      setTrustLevel("ses-old", TRUST_LEVEL.ALL);
      vi.advanceTimersByTime(5 * 60 * 60 * 1000);

      expect(getTrustLevel("ses-old")).toBe(TRUST_LEVEL.ASK);
    } finally {
      vi.useRealTimers();
    }
  });

  it("evicts expired entries when new trust is stored", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      setTrustLevel("ses-old", TRUST_LEVEL.ALL);
      vi.advanceTimersByTime(5 * 60 * 60 * 1000);
      setTrustLevel("ses-new", TRUST_LEVEL.ALL);

      expect(getTrustLevel("ses-old")).toBe(TRUST_LEVEL.ASK);
      expect(getTrustLevel("ses-new")).toBe(TRUST_LEVEL.ALL);
    } finally {
      vi.useRealTimers();
    }
  });
});
