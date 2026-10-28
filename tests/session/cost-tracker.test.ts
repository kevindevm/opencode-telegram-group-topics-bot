import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetCostTrackerForTests,
  clearSessionCost,
  getSessionCost,
  recordSessionCost,
  shouldAlertBudget,
} from "../../src/session/cost-tracker.js";

describe("session/cost-tracker hygiene", () => {
  beforeEach(() => {
    __resetCostTrackerForTests();
  });

  it("clears per-session cost on demand", () => {
    recordSessionCost("ses-1", 1.5);

    expect(getSessionCost("ses-1")).toBeCloseTo(1.5);

    clearSessionCost("ses-1");

    expect(getSessionCost("ses-1")).toBe(0);
  });

  it("evicts oldest sessions beyond the cap instead of growing forever", () => {
    for (let i = 0; i < 1005; i++) {
      recordSessionCost(`ses-${i}`, 1);
    }

    expect(getSessionCost("ses-0")).toBe(0);
    expect(getSessionCost("ses-4")).toBe(0);
    expect(getSessionCost("ses-5")).toBe(1);
    expect(getSessionCost("ses-1004")).toBe(1);
  });

  it("keeps the daily budget alert set bounded", () => {
    for (let day = 1; day <= 70; day++) {
      const key = `2026-01-${String(day).padStart(2, "0")}`;
      expect(shouldAlertBudget(key, 10, 5)).toBe(true);
    }

    // Recent days stay sticky: no second alert within the retained window.
    expect(shouldAlertBudget("2026-01-70", 10, 5)).toBe(false);
  });
});
