import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetchAll";

export type VerificationRow = {
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
    description: string;
    amount: number;
    expected_date: string;
    status: string;
  }>((from, to) =>
    supabase
      .from(forecastTable)
      .select("description, amount, expected_date, status")
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

  const combined: VerificationRow[] = [
    ...forecastRows.map((r) => ({
      type: "forecast" as const,
      description: r.description,
      amount: r.amount,
      date: r.expected_date,
      status: r.status,
    })),
    ...invoiceRows.map((r) => ({
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
