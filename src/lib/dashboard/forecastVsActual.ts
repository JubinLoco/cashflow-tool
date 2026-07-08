import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows, type RangedResult } from "@/lib/supabase/fetchAll";

export type MonthlyComparison = { month: string; forecast: number; actual: number };

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

async function monthlyTotals(
  supabase: ReturnType<typeof createAdminClient>,
  table: "sales_forecast" | "purchase_forecast" | "customer_invoices" | "supplier_invoices",
  dateField: string,
  amountField: string,
  startDate: string,
  endDate: string,
): Promise<Map<string, number>> {
  const selectClause: string = `${dateField}, ${amountField}`;
  type Row = Record<string, string | number>;
  const rows = await fetchAllRows<Row>(
    (from, to) =>
      supabase
        .from(table)
        .select(selectClause)
        .gte(dateField, startDate)
        .lt(dateField, endDate)
        .range(from, to) as unknown as PromiseLike<RangedResult<Row>>,
  );
  const totals = new Map<string, number>();
  for (const row of rows) {
    const key = monthKey(String(row[dateField]));
    totals.set(key, (totals.get(key) ?? 0) + Number(row[amountField]));
  }
  return totals;
}

export async function computeForecastVsActual(monthsBack: number, monthsForward: number) {
  const supabase = createAdminClient();
  const today = new Date();
  const startMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - monthsBack, 1));
  const endMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + monthsForward + 1, 1));
  const startDate = startMonth.toISOString().slice(0, 10);
  const endDate = endMonth.toISOString().slice(0, 10);

  const [salesForecastTotals, actualSalesTotals, purchaseForecastTotals, actualPurchaseTotals] = await Promise.all([
    monthlyTotals(supabase, "sales_forecast", "expected_date", "amount", startDate, endDate),
    monthlyTotals(supabase, "customer_invoices", "invoice_date", "total", startDate, endDate),
    monthlyTotals(supabase, "purchase_forecast", "expected_date", "amount", startDate, endDate),
    monthlyTotals(supabase, "supplier_invoices", "invoice_date", "total", startDate, endDate),
  ]);

  const months: string[] = [];
  let cursor = new Date(startMonth);
  while (cursor < endMonth) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }

  const sales: MonthlyComparison[] = months.map((m) => ({
    month: m,
    forecast: salesForecastTotals.get(m) ?? 0,
    actual: actualSalesTotals.get(m) ?? 0,
  }));
  const purchases: MonthlyComparison[] = months.map((m) => ({
    month: m,
    forecast: purchaseForecastTotals.get(m) ?? 0,
    actual: actualPurchaseTotals.get(m) ?? 0,
  }));

  return { sales, purchases };
}
