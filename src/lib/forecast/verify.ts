import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import { loadDerivationSettings, deriveTaxFlows, deriveMaterialCostFlows } from "@/lib/dashboard/derivedForecast";

export type VerificationRow = {
  id: string | null;
  type: "forecast" | "actual";
  description: string;
  amount: number;
  date: string;
  status: string;
};

// Merges forecast entries with the real invoices they're compared against (same
// invoice_date/expected_date basis the reconciliation matcher uses), so a matched
// forecast row and its real invoice show up near each other for a visual double-check
// that nothing is being double-counted.
export async function buildVerificationList(
  forecastTable: "sales_forecast" | "purchase_forecast",
  invoiceTable: "customer_invoices" | "supplier_invoices",
  startDate: string,
  endDate: string,
): Promise<VerificationRow[]> {
  const supabase = createAdminClient();

  const forecastRows = await fetchAllRows<{
    id: string;
    description: string;
    amount: number;
    expected_date: string;
    status: string;
  }>((from, to) =>
    supabase
      .from(forecastTable)
      .select("id, description, amount, expected_date, status")
      .gte("expected_date", startDate)
      .lt("expected_date", endDate)
      .range(from, to),
  );

  const nameField = invoiceTable === "customer_invoices" ? "customer_name" : "supplier_name";
  const invoiceRows = await fetchAllRows<{
    [key: string]: string | number | null;
    total: number;
    invoice_date: string;
    balance: number;
  }>((from, to) =>
    supabase
      .from(invoiceTable)
      .select(`${nameField}, total, invoice_date, balance`)
      .gte("invoice_date", startDate)
      .lt("invoice_date", endDate)
      .range(from, to),
  );

  // The purchase side also has tax/material cost derived live from sales_forecast (see
  // derivedForecast.ts) — never stored as purchase_forecast rows, so without this they're
  // invisible here even though they're real projected outflows. A derived flow's date can
  // land well after the sale that produced it (up to the FoxESS payment term), so pull all
  // still-open sales forecast rows regardless of date and filter the resulting flows by date,
  // not the other way around.
  const derivedRows: VerificationRow[] = [];
  if (forecastTable === "purchase_forecast") {
    const salesForecast = await fetchAllRows<{ amount: number; probability: number; expected_date: string }>((from, to) =>
      supabase.from("sales_forecast").select("amount, probability, expected_date").eq("status", "forecast").range(from, to),
    );
    const settings = await loadDerivationSettings(supabase);
    const flows = [...deriveTaxFlows(salesForecast, settings), ...deriveMaterialCostFlows(salesForecast, settings)];
    for (const flow of flows) {
      if (flow.date < startDate || flow.date >= endDate) continue;
      derivedRows.push({ id: null, type: "forecast", description: flow.description, amount: Math.abs(flow.amount), date: flow.date, status: "derived" });
    }
  }

  const combined: VerificationRow[] = [
    ...forecastRows.map((r) => ({
      id: r.id,
      type: "forecast" as const,
      description: r.description,
      amount: r.amount,
      date: r.expected_date,
      status: r.status,
    })),
    ...derivedRows,
    ...invoiceRows.map((r) => ({
      id: null,
      type: "actual" as const,
      description: String(r[nameField] ?? "Unknown"),
      amount: r.total,
      date: r.invoice_date,
      status: r.balance <= 0 ? "paid" : "open",
    })),
  ];

  combined.sort((a, b) => a.date.localeCompare(b.date));
  return combined;
}
