import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import settlementGeography from "@/data/territories/settlements.json";
import type { MonthlyRecord } from "./tierHistory";
import type { Settlement } from "./types";

type InvoiceRow = {
  customer_number: string | null;
  customer_name: string | null;
  net_total: number | null;
  total: number | null;
  gross_profit: number | null;
  invoice_date: string | null;
};

type GeographyRow = { customerNumber: string; province: string | null; city: string | null };

function yearMonthOf(dateStr: string): string {
  return dateStr.slice(0, 7); // "YYYY-MM"
}

// Anchored to the 1st so month-length differences (28 vs 31 days) never shift the
// resulting yearMonth by one when subtracting whole months.
function monthsAgo(n: number): Date {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d;
}

export type SettlementsResult = {
  settlements: Settlement[];
  history: Record<string, MonthlyRecord[]>;
};

/**
 * Computes settlement turnover/margin/monthly-history live from cashflow-tool's own
 * synced customer_invoices, replacing the standalone Territories app's one-off Fortnox
 * pull (src/data/territories/settlement-monthly-history.json, now removed) -- this data
 * refreshes automatically as the existing Fortnox sync runs, no separate pull needed.
 *
 * Province/city aren't present on invoices (Fortnox invoice rows carry no address), so
 * those still come from the static settlements.json geography lookup, keyed by
 * customer_number -- that file only carries identity/geography now, not financials.
 */
export async function readSettlements(): Promise<SettlementsResult> {
  const supabase = createAdminClient();
  const trailingWindowStart = monthsAgo(12).toISOString().slice(0, 10);

  const invoices = await fetchAllRows<InvoiceRow>((from, to) =>
    supabase
      .from("customer_invoices")
      .select("customer_number, customer_name, net_total, total, gross_profit, invoice_date")
      .not("customer_number", "is", null)
      .not("invoice_date", "is", null)
      .gte("invoice_date", trailingWindowStart)
      .range(from, to),
  );

  const geographyByCustomer = new Map((settlementGeography as GeographyRow[]).map((g) => [g.customerNumber, g]));

  const byCustomer = new Map<string, { name: string; months: Map<string, { turnover: number; grossProfit: number }> }>();
  for (const inv of invoices) {
    const customerNumber = inv.customer_number!;
    const entry = byCustomer.get(customerNumber) ?? { name: inv.customer_name ?? customerNumber, months: new Map() };
    if (inv.customer_name) entry.name = inv.customer_name;

    const yearMonth = yearMonthOf(inv.invoice_date!);
    const turnover = inv.net_total ?? inv.total ?? 0;
    const bucket = entry.months.get(yearMonth) ?? { turnover: 0, grossProfit: 0 };
    bucket.turnover += turnover;
    bucket.grossProfit += inv.gross_profit ?? 0;
    entry.months.set(yearMonth, bucket);
    byCustomer.set(customerNumber, entry);
  }

  const history: Record<string, MonthlyRecord[]> = {};
  const settlements: Settlement[] = [];

  for (const [customerNumber, entry] of byCustomer) {
    const monthEntries = [...entry.months.entries()].sort(([a], [b]) => a.localeCompare(b));
    history[customerNumber] = monthEntries.map(([yearMonth, { turnover, grossProfit }]) => ({
      yearMonth,
      turnover,
      // Margin % is a per-month ratio (this month's own profit/turnover), not an average
      // across months -- averaging monthly percentages directly would misweight months
      // with very different turnover.
      marginPct: turnover !== 0 ? (grossProfit / turnover) * 100 : null,
    }));

    const trailingTurnover = monthEntries.reduce((sum, [, m]) => sum + m.turnover, 0);
    const trailingGrossProfit = monthEntries.reduce((sum, [, m]) => sum + m.grossProfit, 0);
    const geo = geographyByCustomer.get(customerNumber);

    settlements.push({
      customerNumber,
      name: entry.name,
      province: geo?.province ?? null,
      city: geo?.city ?? null,
      trailing12moTurnover: trailingTurnover,
      marginPct: trailingTurnover !== 0 ? (trailingGrossProfit / trailingTurnover) * 100 : null,
      monthsWithData: monthEntries.length,
      tier: "unknown", // overwritten by classifyAllSettlements
    });
  }

  return { settlements, history };
}
