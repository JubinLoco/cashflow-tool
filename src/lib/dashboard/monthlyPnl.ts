import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import { classifyAccount, classifyBalanceSheetAccount, type BalanceSheetBucket } from "@/lib/dashboard/basAccounts";

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
  // Balance-sheet ratios — real/actual only, no forecast equivalent (forecasting a full
  // balance sheet is out of scope). Null for any month that isn't fully closed yet (same
  // monthCloses() cutoff as the COGS/opex trend — a partially-booked month understates
  // liabilities as easily as it understates costs) or has no balance-sheet data at all.
  soliditet: number | null; // equity ÷ total assets
  kassalikviditet: number | null; // current assets excl. inventory ÷ current liabilities
  avkastningPaTotaltKapital: number | null; // YTD company profit ÷ total assets (see note below)
  kapitaletsOmsattningshastighet: number | null; // YTD turnover ÷ total assets
};

const BS_BUCKETS: BalanceSheetBucket[] = [
  "fixedAssets",
  "inventory",
  "currentAssetsOther",
  "equity",
  "longTermLiabilities",
  "currentLiabilities",
];
function emptyBsRecord(): Record<BalanceSheetBucket, number> {
  return { fixedAssets: 0, inventory: 0, currentAssetsOther: 0, equity: 0, longTermLiabilities: 0, currentLiabilities: 0 };
}
// Credit-natured, same convention turnover already uses in the P&L loop — negate so a real
// credit balance (equity, a liability owed) reads as a positive economic value.
function isCreditNaturedBsBucket(bucket: BalanceSheetBucket): boolean {
  return bucket === "equity" || bucket === "longTermLiabilities" || bucket === "currentLiabilities";
}

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

  const [voucherRows, budgetRows, startingEquitySetting, salesForecastRows, vatRateSetting, accountRows] = await Promise.all([
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
    // Opening balance for the current fiscal year, per account — see basAccounts.ts for why
    // this is what makes balance-sheet ratios computable without a historical voucher backfill.
    fetchAllRows<{ number: string; balance_brought_forward: number | null }>((from, to) =>
      supabase.from("fortnox_accounts").select("number, balance_brought_forward").range(from, to),
    ),
  ]);
  const startingEquity = Number(startingEquitySetting.data?.value ?? 0);
  // sales_forecast.amount is VAT-inclusive (see weeklyByLine.ts) but real ledger turnover
  // (BAS accounts) never includes VAT — convert so the two are comparable.
  const vatRate = Number(vatRateSetting.data?.value ?? 0.25);

  // Sum every ledger row into a per-month real P&L, across all history (not just the
  // display window) — the equity roll-forward needs to anchor at the true earliest
  // month with ledger data, regardless of how much of that history is actually displayed.
  // The same pass also buckets balance-sheet accounts into per-month deltas (see basAccounts.ts)
  // — a separate concern from the P&L above, just sharing the one scan over voucherRows.
  const realByMonth = new Map<string, { turnover: number; cogs: number; opex: number }>();
  const balanceSheetDeltaByMonth = new Map<string, Record<BalanceSheetBucket, number>>();
  let earliestVoucherDate: string | null = null;
  for (const row of voucherRows) {
    if (!row.transaction_date || !row.account_number) continue;
    const month = row.transaction_date.slice(0, 7);
    const amount = Number(row.amount) || 0;
    if (!earliestVoucherDate || row.transaction_date < earliestVoucherDate) earliestVoucherDate = row.transaction_date;

    const bucket = classifyAccount(row.account_number);
    if (bucket) {
      const entry = realByMonth.get(month) ?? { turnover: 0, cogs: 0, opex: 0 };
      // Turnover accounts are credit-natured (amount = Debit - Credit is negative for a
      // real sale) — negate. Cost accounts are debit-natured — amount is already positive.
      if (bucket === "turnover") entry.turnover += -amount;
      else entry[bucket] += amount;
      realByMonth.set(month, entry);
    }

    const bsBucket = classifyBalanceSheetAccount(row.account_number);
    if (bsBucket) {
      const entry = balanceSheetDeltaByMonth.get(month) ?? emptyBsRecord();
      entry[bsBucket] += isCreditNaturedBsBucket(bsBucket) ? -amount : amount;
      balanceSheetDeltaByMonth.set(month, entry);
    }
  }

  // True balance(account, date) = BalanceBroughtForward (this fiscal year's opening balance,
  // from Fortnox directly) + this fiscal year's voucher postings through date — confirmed
  // against the real August 2026 Periodrapport (see plan notes). No historical backfill needed.
  const openingBalanceByBucket = emptyBsRecord();
  for (const acct of accountRows) {
    const bsBucket = classifyBalanceSheetAccount(acct.number);
    if (!bsBucket) continue;
    const bf = Number(acct.balance_brought_forward) || 0;
    openingBalanceByBucket[bsBucket] += isCreditNaturedBsBucket(bsBucket) ? -bf : bf;
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

  // Cumulative balance-sheet snapshot as of each month-end: opening balance + every delta
  // up to and including that month (mirrors the equity roll-forward pattern below, just for
  // a point-in-time snapshot instead of a running total of profit).
  const balanceSheetByMonth = new Map<string, Record<BalanceSheetBucket, number>>();
  {
    const running = { ...openingBalanceByBucket };
    for (const month of allMonths) {
      const delta = balanceSheetDeltaByMonth.get(month);
      if (delta) for (const b of BS_BUCKETS) running[b] += delta[b];
      balanceSheetByMonth.set(month, { ...running });
    }
  }

  // Year-to-date turnover/company profit per month, reset at each fiscal-year boundary —
  // derived from the earliest synced voucher's month rather than hardcoded, since Fortnox's
  // /vouchers list only ever returns the current fiscal year (confirmed: earliest row here
  // is the fiscal year's own start date). Used as the flow basis for Avkastning på totalt
  // kapital / Kapitalets omsättningshastighet below — a deliberate simplification vs. the
  // rolling-12-month convention those ratios traditionally use, since a true rolling 12 would
  // need data from before this fiscal year, which isn't synced. Will read a bit differently
  // from the accountant's rolling-12 figures until a full fiscal year of history exists.
  const fiscalYearStartMonthNum = earliestVoucherDate ? Number(earliestVoucherDate.slice(5, 7)) : 1;
  const ytdByMonth = new Map<string, { turnover: number; companyProfit: number }>();
  {
    let ytdTurnover = 0;
    let ytdCompanyProfit = 0;
    for (const month of allMonths) {
      if (Number(month.slice(5, 7)) === fiscalYearStartMonthNum) {
        ytdTurnover = 0;
        ytdCompanyProfit = 0;
      }
      const real = realByMonth.get(month);
      if (real) {
        ytdTurnover += real.turnover;
        ytdCompanyProfit += real.turnover - real.cogs - real.opex;
      }
      ytdByMonth.set(month, { turnover: ytdTurnover, companyProfit: ytdCompanyProfit });
    }
  }

  // Real equity: advances only on real ledger data from fully-past months — NOT just
  // "real data exists," since the current month can already have partial real postings
  // (and, per the COGS/opex trend fix above, a still-open month's real figures can be
  // badly distorted — e.g. negative COGS). Freezes once we reach the current month.
  const realEquityByMonth = new Map<string, number>();
  let runningRealEquity = startingEquity;
  for (const month of allMonths) {
    const real = realByMonth.get(month);
    if (real && month < currentMonthKey) runningRealEquity += real.turnover - real.cogs - real.opex;
    realEquityByMonth.set(month, runningRealEquity);
  }

  // Budget equity: follows the exact same real path as above through the last fully-past
  // month, then — from the current month on, regardless of whether that month already has
  // some partial real postings — compounds using whatever the Budget column resolves to
  // (manual entry, else the sales-forecast projection) instead of the distorted partial real
  // figure.
  const budgetEquityByMonth = new Map<string, number>();
  let runningBudgetEquity = startingEquity;
  for (const month of allMonths) {
    const real = realByMonth.get(month);
    if (real && month < currentMonthKey) {
      runningBudgetEquity += real.turnover - real.cogs - real.opex;
    } else {
      const projected = budgetByMonth.get(month) ?? forecastByMonth.get(month);
      if (projected) runningBudgetEquity += projected.turnover - projected.cogs - projected.opex;
    }
    budgetEquityByMonth.set(month, runningBudgetEquity);
  }

  return months.map((month) => {
    const isCurrentOrFuture = month >= currentMonthKey;

    // Balance-sheet ratios: only for fully-closed months (same reasoning as the COGS/opex
    // trend — a still-open month's balance-sheet postings are incomplete, not just its P&L).
    let soliditet: number | null = null;
    let kassalikviditet: number | null = null;
    let avkastningPaTotaltKapital: number | null = null;
    let kapitaletsOmsattningshastighet: number | null = null;
    if (today >= monthCloses(month)) {
      const bs = balanceSheetByMonth.get(month);
      const ytd = ytdByMonth.get(month);
      if (bs && ytd) {
        const totalAssets = bs.fixedAssets + bs.inventory + bs.currentAssetsOther;
        if (totalAssets !== 0) {
          // The current fiscal year's accumulated result isn't posted into the 2099 equity
          // account until year-end closing — it just sits in the P&L accounts (3000-8999)
          // all year. bs.equity alone is therefore only the *prior* years' closed-in equity;
          // the true current equity (matching how the accountant's report adds a separate
          // "Beräknat Resultat" line on top) needs this fiscal year's YTD result folded in too.
          const equityIncludingYtdResult = bs.equity + ytd.companyProfit;
          soliditet = equityIncludingYtdResult / totalAssets;
          // Uses net result (companyProfit) rather than a strict EBIT+financial-income split
          // — a reasonable, slightly conservative first pass (financial items run small for
          // this company); see plan notes for the fuller EBIT/financial-items split option.
          avkastningPaTotaltKapital = ytd.companyProfit / totalAssets;
          kapitaletsOmsattningshastighet = ytd.turnover / totalAssets;
        }
        if (bs.currentLiabilities !== 0) {
          kassalikviditet = bs.currentAssetsOther / bs.currentLiabilities;
        }
      }
    }

    return {
      month,
      real: deriveFigures(realByMonth.get(month) ?? { turnover: 0, cogs: 0, opex: 0 }),
      budget: deriveFigures(budgetByMonth.get(month) ?? forecastByMonth.get(month) ?? { turnover: 0, cogs: 0, opex: 0 }),
      realEquity: isCurrentOrFuture ? null : (realEquityByMonth.get(month) ?? null),
      budgetEquity: isCurrentOrFuture ? (budgetEquityByMonth.get(month) ?? null) : null,
      soliditet,
      kassalikviditet,
      avkastningPaTotaltKapital,
      kapitaletsOmsattningshastighet,
    };
  });
}
