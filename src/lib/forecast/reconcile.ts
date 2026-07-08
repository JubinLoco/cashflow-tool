import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetchAll";

const AMOUNT_TOLERANCE_PCT = 0.05;
const DATE_WINDOW_DAYS = 30;
const MS_PER_DAY = 1000 * 60 * 60 * 24;
const STOPWORDS = new Set(["the", "and", "sek", "exkl", "moms", "order", "payment", "invoice", "ab"]);

type ForecastRow = { id: string; description: string; amount: number; expected_date: string };
type CandidateRow = { id: string; name: string; total: number; invoice_date: string };

// Only counts as a "name-like" token if it contains a letter and isn't a short code —
// filters out amounts, week labels (v28), and stopwords so a generic auto-generated
// label like "V28 161000 SEK exkl moms" tokenizes to nothing (no name signal at all),
// while an actual company name like "Ecoflow" or "TMHS Rental" tokenizes normally.
function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-zåäö0-9\s]/gi, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w) && /[a-zåäö]/.test(w) && !/^\d+$/.test(w)),
  );
}

function hasNameOverlap(description: string, candidateName: string): boolean {
  const a = tokenize(description);
  const b = tokenize(candidateName);
  for (const word of a) if (b.has(word)) return true;
  return false;
}

async function reconcile(
  forecastTable: "sales_forecast" | "purchase_forecast",
  candidateTable: "customer_invoices" | "supplier_invoices",
) {
  const supabase = createAdminClient();
  const nameField = candidateTable === "customer_invoices" ? "customer_name" : "supplier_name";

  const forecasts = await fetchAllRows<ForecastRow>((from, to) =>
    supabase
      .from(forecastTable)
      .select("id, description, amount, expected_date")
      .eq("status", "forecast")
      .order("expected_date", { ascending: true })
      .range(from, to),
  );

  const alreadyMatched = await fetchAllRows<{ matched_invoice_id: string }>((from, to) =>
    supabase.from(forecastTable).select("matched_invoice_id").not("matched_invoice_id", "is", null).range(from, to),
  );
  const excluded = new Set(alreadyMatched.map((r) => r.matched_invoice_id));

  const rawCandidates = await fetchAllRows<{ id: string; total: number; invoice_date: string; [k: string]: unknown }>(
    (from, to) => supabase.from(candidateTable).select(`id, total, invoice_date, ${nameField}`).range(from, to),
  );
  const candidates: CandidateRow[] = rawCandidates
    .filter((c) => !excluded.has(c.id))
    .map((c) => ({ id: c.id, total: c.total, invoice_date: c.invoice_date, name: String(c[nameField] ?? "") }));

  const pool = new Map(candidates.map((c) => [c.id, c]));
  let matched = 0;

  for (const forecast of forecasts) {
    // Only consider candidates within amount tolerance and date window.
    const inTolerance: CandidateRow[] = [];
    for (const candidate of pool.values()) {
      const amountTolerance = Math.max(forecast.amount * AMOUNT_TOLERANCE_PCT, 1);
      if (Math.abs(candidate.total - forecast.amount) > amountTolerance) continue;

      const diffDays = Math.abs(
        (new Date(candidate.invoice_date).getTime() - new Date(forecast.expected_date).getTime()) / MS_PER_DAY,
      );
      if (diffDays > DATE_WINDOW_DAYS) continue;

      inTolerance.push(candidate);
    }

    // A description with name-like tokens (e.g. "Ecoflow") must match a candidate by
    // name — falling back to amount+date alone risks pairing it with an unrelated
    // invoice that coincidentally landed in the same window. Only descriptions with NO
    // name signal at all (generic auto-generated labels like "V28 161000 SEK exkl moms")
    // fall back to amount+date matching, since that's the only information available.
    const descriptionHasNameSignal = tokenize(forecast.description).size > 0;
    const nameMatched = inTolerance.filter((c) => hasNameOverlap(forecast.description, c.name));
    const pickFrom = descriptionHasNameSignal ? nameMatched : inTolerance;

    let best: CandidateRow | null = null;
    let bestDiffDays = Infinity;
    for (const candidate of pickFrom) {
      const diffDays = Math.abs(
        (new Date(candidate.invoice_date).getTime() - new Date(forecast.expected_date).getTime()) / MS_PER_DAY,
      );
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
