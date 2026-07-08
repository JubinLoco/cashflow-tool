import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetchAll";

const AMOUNT_TOLERANCE_PCT = 0.05;
const DATE_WINDOW_DAYS = 30;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

type ForecastRow = { id: string; amount: number; expected_date: string };
type CandidateRow = { id: string; total: number; invoice_date: string };

async function reconcile(
  forecastTable: "sales_forecast" | "purchase_forecast",
  candidateTable: "customer_invoices" | "supplier_invoices",
) {
  const supabase = createAdminClient();

  const forecasts = await fetchAllRows<ForecastRow>((from, to) =>
    supabase
      .from(forecastTable)
      .select("id, amount, expected_date")
      .eq("status", "forecast")
      .order("expected_date", { ascending: true })
      .range(from, to),
  );

  const alreadyMatched = await fetchAllRows<{ matched_invoice_id: string }>((from, to) =>
    supabase.from(forecastTable).select("matched_invoice_id").not("matched_invoice_id", "is", null).range(from, to),
  );
  const excluded = new Set(alreadyMatched.map((r) => r.matched_invoice_id));

  const candidates = (
    await fetchAllRows<CandidateRow>((from, to) =>
      supabase.from(candidateTable).select("id, total, invoice_date").range(from, to),
    )
  ).filter((c) => !excluded.has(c.id));

  const pool = new Map(candidates.map((c) => [c.id, c]));
  let matched = 0;

  for (const forecast of forecasts) {
    let best: CandidateRow | null = null;
    let bestDiffDays = Infinity;

    for (const candidate of pool.values()) {
      const amountTolerance = Math.max(forecast.amount * AMOUNT_TOLERANCE_PCT, 1);
      if (Math.abs(candidate.total - forecast.amount) > amountTolerance) continue;

      const diffDays = Math.abs(
        (new Date(candidate.invoice_date).getTime() - new Date(forecast.expected_date).getTime()) / MS_PER_DAY,
      );
      if (diffDays > DATE_WINDOW_DAYS) continue;

      if (diffDays < bestDiffDays) {
        best = candidate;
        bestDiffDays = diffDays;
      }
    }

    if (best) {
      const { error } = await supabase
        .from(forecastTable)
        .update({ status: "matched", matched_invoice_id: best.id })
        .eq("id", forecast.id);
      if (error) throw new Error(`Failed to mark ${forecastTable} entry matched: ${error.message}`);
      pool.delete(best.id);
      matched++;
    }
  }

  return { forecastCount: forecasts.length, matched };
}

export async function reconcileSalesForecast() {
  return reconcile("sales_forecast", "customer_invoices");
}

export async function reconcilePurchaseForecast() {
  return reconcile("purchase_forecast", "supplier_invoices");
}
