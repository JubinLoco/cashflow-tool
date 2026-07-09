import { fortnoxPaginate } from "@/lib/fortnox/client";
import { createAdminClient } from "@/lib/supabase/admin";

type FortnoxSupplierInvoice = {
  GivenNumber: string;
  SupplierNumber: string;
  SupplierName: string;
  InvoiceDate: string;
  DueDate: string;
  Total: string;
  Balance: string;
  Currency: string;
  CurrencyRate: string;
  CurrencyUnit: string;
  FinalPayDate: string | null;
  Cancel: boolean;
};

export async function syncSupplierInvoices() {
  const supabase = createAdminClient();
  let synced = 0;
  let skippedCancelled = 0;
  const suppliersSeen = new Map<string, string>();

  for await (const batch of fortnoxPaginate<"SupplierInvoices", FortnoxSupplierInvoice>(
    "/supplierinvoices",
    "SupplierInvoices",
  )) {
    const rows = [];
    for (const inv of batch) {
      if (inv.Cancel) {
        skippedCancelled++;
        continue;
      }
      suppliersSeen.set(inv.SupplierNumber, inv.SupplierName);
      // Total/Balance are in the invoice's own currency (Currency), not SEK — CurrencyRate
      // is SEK per CurrencyUnit of that currency (both 1 for SEK invoices, so this is a no-op
      // for the common case).
      const fxRate = Number(inv.CurrencyRate) / Number(inv.CurrencyUnit);
      rows.push({
        fortnox_doc_number: inv.GivenNumber,
        supplier_number: inv.SupplierNumber,
        supplier_name: inv.SupplierName,
        invoice_date: inv.InvoiceDate,
        due_date: inv.DueDate,
        total: Number(inv.Total) * fxRate,
        balance: Number(inv.Balance) * fxRate,
        currency: inv.Currency,
        original_total: Number(inv.Total),
        paid_date: inv.FinalPayDate,
      });
    }

    if (rows.length === 0) continue;

    const { error } = await supabase
      .from("supplier_invoices")
      .upsert(rows, { onConflict: "fortnox_doc_number" });
    if (error) throw new Error(`Failed to upsert supplier invoices: ${error.message}`);
    synced += rows.length;
  }

  if (suppliersSeen.size > 0) {
    const newSuppliers = Array.from(suppliersSeen, ([supplier_number, supplier_name]) => ({
      supplier_number,
      supplier_name,
    }));
    // ignoreDuplicates: never overwrite a category you've already tagged.
    const { error } = await supabase
      .from("supplier_categories")
      .upsert(newSuppliers, { onConflict: "supplier_number", ignoreDuplicates: true });
    if (error) throw new Error(`Failed to register suppliers: ${error.message}`);
  }

  return { synced, skippedCancelled, suppliersSeen: suppliersSeen.size };
}
