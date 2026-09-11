import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import { classifyAccount } from "@/lib/dashboard/basAccounts";

type PnlFigures = { turnover: number; cogs: number; grossProfit: number; opex: number; companyProfit: number };
export type MonthlyPnlRow = {
  month: string;
  real: PnlFigures;
  budget: PnlFigures;
  // Real equity is only ever shown through the last closed month — null from the current
  // month onward (a running equity built partly on an in-progress month is misleading, same
  // reasoning as excluding an unclosed month from the COGS/opex trend above). Budget equity
  // takes over exactly where real equity leaves off, compounding forward on budget/forecast
  // profit — null for any month that still has realEquity instead.
  realEquity: number | null;
  budgetEquity: number | null;
};

function deriveFigures(base: { turnover: number; cogs: number; opex: number }): PnlFigures {
  return {
    turnover: base.turnover,
    cogs: base.cogs,
    grossProfit: base.turnover - base.cogs,
    opex: base.opex,
    companyProfit: base.turnover - base.cogs - base.opex,
  };
}

export async function computeMonthlyPnl(monthsBack: number, monthsForward: number): Promise<MonthlyPnlRow[]> {
  const supabase = createAdminClient();
  const today = new Date();
  const startMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - monthsBack, 1));
  const endMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + monthsForward + 1, 1));

  const [voucherRows, budgetRows, startingEquitySetting, salesForecastRows, vatRateSetting] = await Promise.all([
    fetchAllRows<{ account_number: string | null; transaction_date: string | null; amount: number }>((from, to) =>
      supabase.from("fortnox_vouchers").select("account_number, transaction_date, amount").range(from, to),
    ),
    fetchAllRows<{ month: string; turnover: number; cogs: number; opex: number }>((from, to) =>
      supabase.from("monthly_budget").select("month, turnover, cogs, opex").range(from, to),
    ),
    supabase.from("settings").select("value").eq("key", "starting_equity").maybeSingle(),
    // Unmatched status filtering mirrors weeklyByLine.ts — a matched forecast row is still a
    // valid data point for projecting turnover, only "dropped" (flagged wrong/duplicate) isn't.
    fetchAllRows<{ amount: number; probability: number; expected_date: string }>((from, to) =>
      supabase.from("sales_forecast").select("amount, probability, expected_date").neq("status", "dropped").range(from, to),
    ),
    supabase.from("settings").select("value").eq("key", "vat_rate").maybeSingle(),
  ]);
  const startingEquity = Number(startingEquitySetting.data?.value ?? 0);
  // sales_forecast.amount is VAT-inclusive (see weeklyByLine.ts) but real ledger turnover
  // (BAS accounts) never includes VAT — convert so the two are comparable.
  const vatRate = Number(vatRateSetting.data?.value ?? 0.25);

  // Sum every ledger row into a per-month real P&L, across all history (not just the
  // display window) — the equity roll-forward needs to anchor at the true earliest
  // month with ledger data, regardless of how much of that history is actually displayed.
  const realByMonth = new Map<string, { turnover: number; cogs: number; opex: number }>();
  for (const row of voucherRows) {
    if (!row.transaction_date || !row.account_number) continue;
    const bucket = classifyAccount(row.account_number);
    if (!bucket) continue;
    const month = row.transaction_date.slice(0, 7);
    const entry = realByMonth.get(month) ?? { turnover: 0, cogs: 0, opex: 0 };
    const amount = Number(row.amount) || 0;
    // Turnover accounts are credit-natured (amount = Debit - Credit is negative for a
    // real sale) — negate. Cost accounts are debit-natured — amount is already positive.
    if (bucket === "turnover") entry.turnover += -amount;
    else entry[bucket] += amount;
    realByMonth.set(month, entry);
  }

  const budgetByMonth = new Map(budgetRows.map((r) => [r.month.slice(0, 7), r]));

  const months: string[] = [];
  for (let cursor = new Date(startMonth); cursor < endMonth; cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))) {
    months.push(cursor.toISOString().slice(0, 7));
  }

  // Forecast turnover per month, from the same sales pipeline weeklyByLine.ts already
  // reports on — lets the Budget column auto-populate for any month without a manual
  // monthly_budget entry (a manual entry still overrides, see the resolution below).
  const forecastTurnoverByMonth = new Map<string, number>();
  for (const f of salesForecastRows) {
    const month = f.expected_date.slice(0, 7);
    const exVat = (f.amount * f.probability) / (1 + vatRate);
    forecastTurnoverByMonth.set(month, (forecastTurnoverByMonth.get(month) ?? 0) + exVat);
  }

  // COGS is a variable cost (scales with sales) — trend it as a % of turnover from the
  // last 3 real, fully-closed months. Opex is predominantly fixed (salaries, rent) — trend
  // it as a flat trailing average instead of scaling it with forecast turnover. A month isn't
  // "closed" the moment the calendar page turns — costs like supplier invoices for materials
  // routinely land after the revenue they relate to, and in practice a month's costs aren't
  // fully booked until the 10th-15th of the following month. Trending from a month that
  // hasn't reached that cutoff yet understates COGS more than it understates turnover
  // (confirmed against real data: one partially-booked month showed *negative* COGS), so use
  // day 15 of the following month as the close cutoff, not just "not the current month."
  function monthCloses(month: string): Date {
    const [year, monthNum] = month.split("-").map(Number);
    // monthNum is 1-indexed ("08" for August); passing it directly as Date's 0-indexed month
    // param naturally lands on the 15th of the *following* month (same trick as
    // derivedForecast.ts's nextMonthDueDate).
    return new Date(Date.UTC(year, monthNum, 15));
  }
  const recentRealMonths = Array.from(realByMonth.entries())
    .filter(([month, v]) => v.turnover > 0 && today >= monthCloses(month))
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 3);
  const trailingCogsPct =
    recentRealMonths.length > 0
      ? recentRealMonths.reduce((sum, [, v]) => sum + v.cogs / v.turnover, 0) / recentRealMonths.length
      : 0;
  const trailingOpex =
    recentRealMonths.length > 0 ? recentRealMonths.reduce((sum, [, v]) => sum + v.opex, 0) / recentRealMonths.length : 0;

  const forecastByMonth = new Map<string, { turnover: number; cogs: number; opex: number }>();
  for (const month of months) {
    const turnover = forecastTurnoverByMonth.get(month);
    if (!turnover) continue; // no forecast coverage this month — falls through to the zero default
    forecastByMonth.set(month, { turnover, cogs: turnover * trailingCogsPct, opex: trailingOpex });
  }

  const allMonths = [...new Set([...realByMonth.keys(), ...months])].sort();
  const currentMonthKey = today.toISOString().slice(0, 7);

  // Real equity: advances only on real ledger data — freezes once real data runs out
  // (naturally true from the current month onward, since the ledger can't have future
  // postings, and a current month's partial postings shouldn't feed a displayed equity
  // figure either).
  const realEquityByMonth = new Map<string, number>();
  let runningRealEquity = startingEquity;
  for (const month of allMonths) {
    const real = realByMonth.get(month);
    if (real) runningRealEquity += real.turnover - real.cogs - real.opex;
    realEquityByMonth.set(month, runningRealEquity);
  }

  // Budget equity: follows the exact same real path as above, then keeps compounding past
  // it using whatever the Budget column resolves to (manual entry, else the sales-forecast
  // projection) once real data runs out — this is what "current month onward" displays.
  const budgetEquityByMonth = new Map<string, number>();
  let runningBudgetEquity = startingEquity;
  for (const month of allMonths) {
    const real = realByMonth.get(month);
    if (real) {
      runningBudgetEquity += real.turnover - real.cogs - real.opex;
    } else {
      const projected = budgetByMonth.get(month) ?? forecastByMonth.get(month);
      if (projected) runningBudgetEquity += projected.turnover - projected.cogs - projected.opex;
    }
    budgetEquityByMonth.set(month, runningBudgetEquity);
  }

  return months.map((month) => {
    const isCurrentOrFuture = month >= currentMonthKey;
    return {
      month,
      real: deriveFigures(realByMonth.get(month) ?? { turnover: 0, cogs: 0, opex: 0 }),
      budget: deriveFigures(budgetByMonth.get(month) ?? forecastByMonth.get(month) ?? { turnover: 0, cogs: 0, opex: 0 }),
      realEquity: isCurrentOrFuture ? null : (realEquityByMonth.get(month) ?? null),
      budgetEquity: isCurrentOrFuture ? (budgetEquityByMonth.get(month) ?? null) : null,
    };
  });
}
