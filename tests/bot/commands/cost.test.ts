import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "grammy";
import {
  __resetCostTrackerForTests,
  formatUsd,
  getSessionCost,
  recordSessionCost,
  shouldAlertBudget,
} from "../../../src/session/cost-tracker.js";

const mocked = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  dailyMock: vi.fn(() => 0),
}));

vi.mock("../../../src/session/manager.js", () => ({
  getCurrentSession: mocked.getSessionMock,
}));

vi.mock("../../../src/settings/manager.js", () => ({
  getDailyCost: mocked.dailyMock,
}));

vi.mock("../../../src/bot/scope.js", () => ({
  getScopeFromContext: () => ({ key: "scope-1", threadId: 9 }),
  getThreadSendOptions: (threadId: number | null) =>
    threadId === null ? {} : { message_thread_id: threadId },
}));

import { costCommand } from "../../../src/bot/commands/cost.js";
import { t } from "../../../src/i18n/index.js";

describe("session/cost-tracker", () => {
  beforeEach(() => {
    __resetCostTrackerForTests();
  });

  it("accumulates session cost", () => {
    expect(recordSessionCost("ses-1", 0.01)).toBeCloseTo(0.01);
    expect(recordSessionCost("ses-1", 0.02)).toBeCloseTo(0.03);
    expect(getSessionCost("ses-1")).toBeCloseTo(0.03);
    expect(getSessionCost("other")).toBe(0);
  });

  it("ignores non-positive costs", () => {
    expect(recordSessionCost("ses-1", 0)).toBe(0);
    expect(recordSessionCost("ses-1", -1)).toBe(0);
  });

  it("formats usd with more decimals under a dollar", () => {
    expect(formatUsd(0.001234)).toBe("$0.0012");
    expect(formatUsd(1.5)).toBe("$1.50");
  });

  it("alerts once per day when the budget is reached", () => {
    expect(shouldAlertBudget("2026-10-22", 5, 10)).toBe(false);
    expect(shouldAlertBudget("2026-10-22", 10, 10)).toBe(true);
    expect(shouldAlertBudget("2026-10-22", 99, 10)).toBe(false);
    expect(shouldAlertBudget("2026-10-23", 99, 10)).toBe(true);
    expect(shouldAlertBudget("2026-10-23", 99, 0)).toBe(false);
  });
});

describe("bot/commands/cost", () => {
  beforeEach(() => {
    __resetCostTrackerForTests();
    mocked.getSessionMock.mockReset().mockReturnValue({
      id: "session-1",
      title: "Session",
      directory: "/repo/app",
    });
    mocked.dailyMock.mockReset().mockReturnValue(0.05);
  });

  function createCommandContext(): Context {
    return {
      reply: vi.fn().mockResolvedValue(undefined),
    } as unknown as Context;
  }

  it("reports no session without one", async () => {
    mocked.getSessionMock.mockReturnValue(undefined);
    const ctx = createCommandContext();

    await costCommand(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith(t("cost.no_session"), { message_thread_id: 9 });
  });

  it("reports session and daily spend", async () => {
    recordSessionCost("session-1", 0.02);
    const ctx = createCommandContext();

    await costCommand(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("$0.0200"), {
      message_thread_id: 9,
    });
  });
});
