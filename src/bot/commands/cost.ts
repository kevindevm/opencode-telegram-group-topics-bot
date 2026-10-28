import { CommandContext, Context } from "grammy";
import { config } from "../../config.js";
import { getCurrentSession } from "../../session/manager.js";
import { summaryAggregator } from "../../summary/aggregator.js";
import { formatUsd, getSessionCost, todayKey } from "../../session/cost-tracker.js";
import { getDailyCost } from "../../settings/manager.js";
import { t } from "../../i18n/index.js";
import { getScopeFromContext, getThreadSendOptions } from "../scope.js";

export async function costCommand(ctx: CommandContext<Context>): Promise<void> {
  const scope = getScopeFromContext(ctx);
  const scopeKey = scope?.key;
  const session = scopeKey ? getCurrentSession(scopeKey) : undefined;
  const threadOptions = getThreadSendOptions(scope?.threadId ?? null);

  if (!session) {
    await ctx.reply(t("cost.no_session"), threadOptions);
    return;
  }

  const day = todayKey();
  // Subagent transcripts burn cost under their own session ids: include the
  // whole family so the total matches the server dashboard.
  let sessionCost = getSessionCost(session.id);
  for (const childId of summaryAggregator.getDescendantSessionIds(session.id)) {
    sessionCost += getSessionCost(childId);
  }
  const dayTotal = getDailyCost(day);
  const budget = config.cost.budgetAlertUsd;

  await ctx.reply(
    t("cost.report", {
      title: session.title,
      session: formatUsd(sessionCost),
      day,
      today: formatUsd(dayTotal),
      budget: budget > 0 ? formatUsd(budget) : t("cost.budget_off"),
    }),
    threadOptions,
  );
}
