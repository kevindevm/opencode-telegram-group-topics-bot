import { logger } from "../utils/logger.js";

const sessionCosts = new Map<string, number>();
const budgetAlertedDays = new Set<string>();

const MAX_SESSION_COST_ENTRIES = 1000;
const MAX_BUDGET_DAY_ENTRIES = 62;

function pruneBudgetAlertedDays(): void {
  while (budgetAlertedDays.size > MAX_BUDGET_DAY_ENTRIES) {
    // Day keys are YYYY-MM-DD, so lexicographic order is chronological.
    let oldest: string | undefined;
    for (const day of budgetAlertedDays) {
      if (oldest === undefined || day < oldest) {
        oldest = day;
      }
    }

    if (oldest === undefined) {
      return;
    }

    budgetAlertedDays.delete(oldest);
  }
}

export function clearSessionCost(sessionId: string): void {
  if (!sessionId) {
    return;
  }

  sessionCosts.delete(sessionId);
}

export function recordSessionCost(sessionId: string, cost: number): number {
  if (!sessionId || !(cost > 0)) {
    return sessionCosts.get(sessionId) ?? 0;
  }

  if (!sessionCosts.has(sessionId)) {
    while (sessionCosts.size >= MAX_SESSION_COST_ENTRIES) {
      const oldest = sessionCosts.keys().next();
      if (oldest.done) {
        break;
      }

      sessionCosts.delete(oldest.value);
    }
  }

  const total = (sessionCosts.get(sessionId) ?? 0) + cost;
  sessionCosts.set(sessionId, total);
  return total;
}

export function getSessionCost(sessionId: string): number {
  return sessionCosts.get(sessionId) ?? 0;
}

export function formatUsd(cost: number): string {
  return `$${cost.toFixed(cost < 1 ? 4 : 2)}`;
}

export function todayKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** True once per day when the daily total first reaches the budget. */
export function shouldAlertBudget(day: string, dayTotal: number, budgetUsd: number): boolean {
  if (!(budgetUsd > 0) || dayTotal < budgetUsd || budgetAlertedDays.has(day)) {
    return false;
  }

  budgetAlertedDays.add(day);
  pruneBudgetAlertedDays();
  logger.warn(`[CostTracker] Daily budget reached: total=${dayTotal}, budget=${budgetUsd}`);
  return true;
}

export function __resetCostTrackerForTests(): void {
  sessionCosts.clear();
  budgetAlertedDays.clear();
}
