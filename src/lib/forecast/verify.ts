import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import { loadDerivationSettings, deriveTaxFlows, deriveMaterialCostFlows } from "@/lib/dashboard/derivedForecast";

export type VerificationRow = {
  id: string | null;
  type: "forecast" | "actual";
  description: string;
  amount: number;
  // The date the table sorts and is primarily compared by — invoice_date for sales (a
  // sales forecast predicts when the sale/invoice happens), payment date (paid_date once
  // settled, else due_date) for purchases (a purchase forecast predicts when we pay).
  date: string;
  // The *other* date, informational only, actual rows only: payment date for sales,
  // invoice_date for purchases.
  secondaryDate: string | null;
  status: string;
  recurringGroupId: string | null;
  // Sales forecast rows only — null means "use the global gross_margin_pct default"
  // (see weeklyByLine.ts). Always null for purchase forecast, derived, and actual rows.
  expectedMarginPct: number | null;
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

  const isSales = invoiceTable === "customer_invoices";

  // expected_margin_pct only exists on sales_forecast — select it conditionally rather
  // than assuming the column on both tables.
  const forecastRows = await fetchAllRows<{
    id: string;
    description: string;
    amount: number;
    expected_date: string;
    status: string;
    recurring_group_id: string | null;
    expected_margin_pct?: number | null;
  }>((from, to) =>
    supabase
      .from(forecastTable)
      .select(
        isSales
          ? "id, description, amount, expected_date, status, recurring_group_id, expected_margin_pct"
          : "id, description, amount, expected_date, status, recurring_group_id",
      )
      .gte("expected_date", startDate)
      .lt("expected_date", endDate)
      .range(from, to),
  );

  const nameField = invoiceTable === "customer_invoices" ? "customer_name" : "supplier_name";
  const invoiceRows = await fetchAllRows<{
    [key: string]: string | number | boolean | null;
    id: string;
    total: number;
    invoice_date: string;
    due_date: string;
    paid_date: string | null;
    balance: number;
    manual_paid: boolean | null;
  }>((from, to) =>
    supabase
      .from(invoiceTable)
      .select(`id, ${nameField}, total, invoice_date, due_date, paid_date, balance, manual_paid`)
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
      derivedRows.push({
        id: null,
        type: "forecast",
        description: flow.description,
        amount: Math.abs(flow.amount),
        date: flow.date,
        secondaryDate: null,
        status: "derived",
        recurringGroupId: null,
        expectedMarginPct: null,
      });
    }
  }

  const combined: VerificationRow[] = [
    ...forecastRows.map((r) => ({
      id: r.id,
      type: "forecast" as const,
      description: r.description,
      amount: r.amount,
      date: r.expected_date,
      secondaryDate: null,
      status: r.status,
      recurringGroupId: r.recurring_group_id,
      expectedMarginPct: r.expected_margin_pct ?? null,
    })),
    ...derivedRows,
    ...invoiceRows.map((r) => {
      const paymentDate = r.paid_date ?? r.due_date;
      return {
        id: r.id,
        type: "actual" as const,
        description: String(r[nameField] ?? "Unknown"),
        amount: r.total,
        date: isSales ? r.invoice_date : paymentDate,
        secondaryDate: isSales ? paymentDate : r.invoice_date,
        // manual_paid overrides the Fortnox-synced balance when set, for when the sync
        // hasn't caught up yet — same reasoning as the forecast Drop/Match override.
        status: (r.manual_paid ?? r.balance <= 0) ? "paid" : "open",
        recurringGroupId: null,
        expectedMarginPct: null,
      };
    }),
  ];

  combined.sort((a, b) => a.date.localeCompare(b.date));
  return combined;
}
