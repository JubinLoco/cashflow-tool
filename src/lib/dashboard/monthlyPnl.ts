import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import { classifyAccount } from "@/lib/dashboard/basAccounts";

type PnlFigures = { turnover: number; cogs: number; grossProfit: number; opex: number; companyProfit: number };
export type MonthlyPnlRow = { month: string; real: PnlFigures; budget: PnlFigures; equity: number };

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

  const [voucherRows, budgetRows, startingEquitySetting] = await Promise.all([
    fetchAllRows<{ account_number: string | null; transaction_date: string | null; amount: number }>((from, to) =>
      supabase.from("fortnox_vouchers").select("account_number, transaction_date, amount").range(from, to),
    ),
    fetchAllRows<{ month: string; turnover: number; cogs: number; opex: number }>((from, to) =>
      supabase.from("monthly_budget").select("month, turnover, cogs, opex").range(from, to),
    ),
    supabase.from("settings").select("value").eq("key", "starting_equity").maybeSingle(),
  ]);
  const startingEquity = Number(startingEquitySetting.data?.value ?? 0);

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

  const equityByMonth = new Map<string, number>();
  const allMonths = [...new Set([...realByMonth.keys(), ...months])].sort();
  let runningEquity = startingEquity;
  for (const month of allMonths) {
    const real = realByMonth.get(month);
    if (real) runningEquity += real.turnover - real.cogs - real.opex;
    equityByMonth.set(month, runningEquity);
  }

  return months.map((month) => ({
    month,
    real: deriveFigures(realByMonth.get(month) ?? { turnover: 0, cogs: 0, opex: 0 }),
    budget: deriveFigures(budgetByMonth.get(month) ?? { turnover: 0, cogs: 0, opex: 0 }),
    equity: equityByMonth.get(month) ?? runningEquity,
  }));
}
