import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows, type RangedResult } from "@/lib/supabase/fetchAll";
import { loadDerivationSettings, deriveTaxFlows, deriveMaterialCostFlows } from "@/lib/dashboard/derivedForecast";

export type MonthlyComparison = { month: string; forecast: number; actual: number };

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

// Tax and material cost derived from unmatched sales forecast (see derivedForecast.ts) —
// bucketed by the derived flow's own date, not the source sale's date, since a material
// cost can land 30-55 days after the sale that generated it.
async function derivedPurchaseTotals(
  supabase: ReturnType<typeof createAdminClient>,
  startDate: string,
  endDate: string,
): Promise<Map<string, number>> {
  const salesForecast = await fetchAllRows<{ amount: number; probability: number; expected_date: string }>(
    (from, to) =>
      supabase.from("sales_forecast").select("amount, probability, expected_date").eq("status", "forecast").range(from, to),
  );
  const settings = await loadDerivationSettings(supabase);
  const flows = [...deriveTaxFlows(salesForecast, settings), ...deriveMaterialCostFlows(salesForecast, settings)];

  const totals = new Map<string, number>();
  for (const flow of flows) {
    if (flow.date < startDate || flow.date >= endDate) continue;
    const key = monthKey(flow.date);
    totals.set(key, (totals.get(key) ?? 0) + Math.abs(flow.amount));
  }
  return totals;
}

async function forecastTotals(
  supabase: ReturnType<typeof createAdminClient>,
  table: "sales_forecast" | "purchase_forecast",
  startDate: string,
  endDate: string,
): Promise<Map<string, number>> {
  type Row = { expected_date: string; amount: number };
  // Dropped rows are flagged wrong/duplicate and must never count toward a forecast
  // total (see weeklyByLine.ts for the same rule) — matched rows still count here since
  // this chart is a forecast-vs-actual comparison, same reasoning as weeklyByLine.
  const rows =
    table === "sales_forecast"
      ? await fetchAllRows<Row>((from, to) =>
          supabase
            .from("sales_forecast")
            .select("expected_date, amount")
            .neq("status", "dropped")
            .gte("expected_date", startDate)
            .lt("expected_date", endDate)
            .range(from, to),
        )
      : await fetchAllRows<Row>((from, to) =>
          supabase
            .from("purchase_forecast")
            .select("expected_date, amount")
            .neq("status", "dropped")
            .gte("expected_date", startDate)
            .lt("expected_date", endDate)
            .range(from, to),
        );
  const totals = new Map<string, number>();
  for (const row of rows) {
    const key = monthKey(row.expected_date);
    totals.set(key, (totals.get(key) ?? 0) + Number(row.amount));
  }
  return totals;
}

// Actual sales cash timing follows the factoring split (70% D+1, 30% at customer
// payment) — cash_events already encodes this, so "actual" uses it directly rather
// than the full invoice total on invoice_date.
async function actualSalesFromCashEvents(
  supabase: ReturnType<typeof createAdminClient>,
  startDate: string,
  endDate: string,
): Promise<Map<string, number>> {
  type Row = { event_date: string; amount: number };
  const rows = await fetchAllRows<Row>((from, to) =>
    supabase
      .from("cash_events")
      .select("event_date, amount")
      .gte("event_date", startDate)
      .lt("event_date", endDate)
      .range(from, to),
  );
  const totals = new Map<string, number>();
  for (const row of rows) {
    const key = monthKey(row.event_date);
    totals.set(key, (totals.get(key) ?? 0) + Number(row.amount));
  }
  return totals;
}

// Actual purchase cash timing is when the payment actually leaves the bank — paid_date
// if settled, else due_date as the best estimate for still-open invoices. Same logic as
// the balance projection. Fetched unfiltered (small table) since the effective date isn't
// a real column to filter on server-side.
async function actualPurchasesFromInvoices(
  supabase: ReturnType<typeof createAdminClient>,
  startDate: string,
  endDate: string,
): Promise<Map<string, number>> {
  type Row = { due_date: string; paid_date: string | null; total: number };
  const rows = await fetchAllRows<Row>((from, to) =>
    supabase.from("supplier_invoices").select("due_date, paid_date, total").range(from, to),
  );
  const totals = new Map<string, number>();
  for (const row of rows) {
    const effectiveDate = row.paid_date ?? row.due_date;
    if (effectiveDate < startDate || effectiveDate >= endDate) continue;
    const key = monthKey(effectiveDate);
    totals.set(key, (totals.get(key) ?? 0) + Number(row.total));
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

  const [salesForecastTotals, actualSalesTotals, purchaseForecastTotals, actualPurchaseTotals, derivedTotals] =
    await Promise.all([
      forecastTotals(supabase, "sales_forecast", startDate, endDate),
      actualSalesFromCashEvents(supabase, startDate, endDate),
      forecastTotals(supabase, "purchase_forecast", startDate, endDate),
      actualPurchasesFromInvoices(supabase, startDate, endDate),
      derivedPurchaseTotals(supabase, startDate, endDate),
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
    forecast: (purchaseForecastTotals.get(m) ?? 0) + (derivedTotals.get(m) ?? 0),
    actual: actualPurchaseTotals.get(m) ?? 0,
  }));

  return { sales, purchases };
}
