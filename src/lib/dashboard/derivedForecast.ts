import { createAdminClient } from "@/lib/supabase/admin";

export type DerivationSettings = {
  taxPctOfSales: number;
  taxDueDay: number;
  materialCostPct: number;
  foxessSharePct: number;
  foxessPaymentDays: number;
  otherSupplierPaymentDays: number;
};

export type DerivedFlow = { date: string; amount: number; description: string; key: string };

type SalesForecastRow = { id: string; amount: number; probability: number; expected_date: string };

function addDays(date: string, days: number): string {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + Math.round(days));
  return d.toISOString().slice(0, 10);
}

// Next month, same numeric day as taxDueDay — relies on Date's month param being
// 0-indexed while `month` here is a 1-indexed "YYYY-MM" component, so passing the
// current 1-indexed month number directly as the (0-indexed) month param naturally
// lands on the following month.
function nextMonthDueDate(month: string, day: number): string {
  const [year, monthNum] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNum, day)).toISOString().slice(0, 10);
}

export async function loadDerivationSettings(supabase: ReturnType<typeof createAdminClient>): Promise<DerivationSettings> {
  const { data, error } = await supabase
    .from("settings")
    .select("key, value")
    .in("key", [
      "tax_pct_of_sales",
      "tax_due_day",
      "gross_margin_pct",
      "foxess_share_pct",
      "foxess_payment_days",
      "other_supplier_payment_days",
    ]);
  if (error) throw new Error(`Failed to load derivation settings: ${error.message}`);
  const map = new Map((data ?? []).map((row) => [row.key, row.value]));

  return {
    taxPctOfSales: map.get("tax_pct_of_sales") ?? 0.2,
    taxDueDay: map.get("tax_due_day") ?? 26,
    materialCostPct: 1 - (map.get("gross_margin_pct") ?? 0.15),
    foxessSharePct: map.get("foxess_share_pct") ?? 0.8,
    foxessPaymentDays: map.get("foxess_payment_days") ?? 55,
    otherSupplierPaymentDays: map.get("other_supplier_payment_days") ?? 30,
  };
}

// Both derived flows are computed live, never stored as rows — this lets a specific one be
// overridden with a known actual value (see derived_forecast_overrides) as the real date
// approaches, keyed by the same stable synthetic id used in deriveTaxFlows/
// deriveMaterialCostFlows below. Stored as a positive magnitude, matching how real
// forecast-row amounts are stored/edited elsewhere — sign is applied here, same place the
// formula-computed amount is already negated.
export async function loadDerivedForecastOverrides(supabase: ReturnType<typeof createAdminClient>): Promise<Map<string, number>> {
  const { data } = await supabase.from("derived_forecast_overrides").select("key, amount");
  return new Map((data ?? []).map((r) => [r.key, r.amount]));
}

// Tax is charged on total sales for a month, due on a fixed day of the following month —
// grouped by month rather than per-entry since it's a single monthly payment.
export function deriveTaxFlows(
  salesForecast: SalesForecastRow[],
  settings: DerivationSettings,
  overrides: Map<string, number>,
): DerivedFlow[] {
  const byMonth = new Map<string, number>();
  for (const f of salesForecast) {
    const month = f.expected_date.slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + f.amount * f.probability);
  }

  return Array.from(byMonth.entries()).map(([month, total]) => {
    const key = `tax:${month}`;
    const override = overrides.get(key);
    return {
      key,
      date: nextMonthDueDate(month, settings.taxDueDay),
      amount: override !== undefined ? -Math.abs(override) : -(total * settings.taxPctOfSales),
      description: `Tax (${Math.round(settings.taxPctOfSales * 100)}% of ${month} sales forecast)${override !== undefined ? " — actual" : ""}`,
    };
  });
}

// Material cost is per-sale (each sale implies its own material purchase, with its own
// payment-terms clock), split between the dominant supplier (FoxESS) and everyone else.
export function deriveMaterialCostFlows(
  salesForecast: SalesForecastRow[],
  settings: DerivationSettings,
  overrides: Map<string, number>,
): DerivedFlow[] {
  const flows: DerivedFlow[] = [];
  for (const f of salesForecast) {
    const totalCost = f.amount * f.probability * settings.materialCostPct;
    const foxessCost = totalCost * settings.foxessSharePct;
    const otherCost = totalCost - foxessCost;

    const foxessKey = `material:${f.id}:foxess`;
    const foxessOverride = overrides.get(foxessKey);
    if (foxessCost > 0 || foxessOverride !== undefined) {
      flows.push({
        key: foxessKey,
        date: addDays(f.expected_date, settings.foxessPaymentDays),
        amount: foxessOverride !== undefined ? -Math.abs(foxessOverride) : -foxessCost,
        description: `FoxESS material cost (${settings.foxessPaymentDays}d, derived)${foxessOverride !== undefined ? " — actual" : ""}`,
      });
    }
    const otherKey = `material:${f.id}:other`;
    const otherOverride = overrides.get(otherKey);
    if (otherCost > 0 || otherOverride !== undefined) {
      flows.push({
        key: otherKey,
        date: addDays(f.expected_date, settings.otherSupplierPaymentDays),
        amount: otherOverride !== undefined ? -Math.abs(otherOverride) : -otherCost,
        description: `Other material cost (${settings.otherSupplierPaymentDays}d, derived)${otherOverride !== undefined ? " — actual" : ""}`,
      });
    }
  }
  return flows;
}
