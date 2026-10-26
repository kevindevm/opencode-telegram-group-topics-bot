import { logger } from "../utils/logger.js";

const sessionCosts = new Map<string, number>();
const budgetAlertedDays = new Set<string>();

export function recordSessionCost(sessionId: string, cost: number): number {
  if (!sessionId || !(cost > 0)) {
    return sessionCosts.get(sessionId) ?? 0;
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
  logger.warn(`[CostTracker] Daily budget reached: total=${dayTotal}, budget=${budgetUsd}`);
  return true;
}

export function __resetCostTrackerForTests(): void {
  sessionCosts.clear();
  budgetAlertedDays.clear();
}
