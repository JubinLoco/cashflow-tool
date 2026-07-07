import { fortnoxPaginate } from "@/lib/fortnox/client";
import { createAdminClient } from "@/lib/supabase/admin";

type FortnoxInvoice = {
  DocumentNumber: string;
  CustomerNumber: string;
  CustomerName: string;
  InvoiceDate: string;
  DueDate: string;
  Total: number;
  Balance: number;
  FinalPayDate: string | null;
  Cancelled: boolean;
};

export async function syncCustomerInvoices() {
  const supabase = createAdminClient();
  let synced = 0;
  let skippedCancelled = 0;

  for await (const batch of fortnoxPaginate<"Invoices", FortnoxInvoice>("/invoices", "Invoices")) {
    const rows = batch
      .filter((inv) => !inv.Cancelled)
      .map((inv) => ({
        fortnox_doc_number: inv.DocumentNumber,
        customer_number: inv.CustomerNumber,
        customer_name: inv.CustomerName,
        invoice_date: inv.InvoiceDate,
        due_date: inv.DueDate,
        total: inv.Total,
        balance: inv.Balance,
        paid_date: inv.FinalPayDate,
      }));
    skippedCancelled += batch.length - rows.length;

    if (rows.length === 0) continue;

    const { error } = await supabase
      .from("customer_invoices")
      .upsert(rows, { onConflict: "fortnox_doc_number" });
    if (error) throw new Error(`Failed to upsert customer invoices: ${error.message}`);
    synced += rows.length;
  }

  return { synced, skippedCancelled };
}
