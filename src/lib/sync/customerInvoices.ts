import { fortnoxPaginate, fortnoxGetDetails } from "@/lib/fortnox/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import { CONSULTANCY_ARTICLE_NUMBERS } from "@/lib/sales/businessLine";

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

// Only the per-invoice detail endpoint exposes gross profit and row-level article
// numbers — the list endpoint used by fortnoxPaginate above doesn't carry them.
// ContributionValue (gross profit) is computed on the ex-VAT amount, so Net (also
// ex-VAT) — not the VAT-inclusive Total — is the correct denominator for margin %.
// Row-level Total/TotalExcludingVAT/ContributionValue come back as strings.
type FortnoxInvoiceRow = { ArticleNumber: string; Total: string; TotalExcludingVAT: string; ContributionValue: string };
type FortnoxInvoiceDetail = {
  ContributionValue: number;
  Net: number;
  InvoiceRows: FortnoxInvoiceRow[];
};

type ExistingClassification = {
  fortnox_doc_number: string;
  gross_profit: number | null;
  net_total: number | null;
  consultancy_total: number | null;
  consultancy_net_total: number | null;
  consultancy_gross_profit: number | null;
};

function sumConsultancyRows(rows: FortnoxInvoiceRow[]) {
  const consultancyRows = rows.filter((row) => CONSULTANCY_ARTICLE_NUMBERS.has(row.ArticleNumber));
  return {
    total: consultancyRows.reduce((sum, row) => sum + Number(row.Total), 0),
    netTotal: consultancyRows.reduce((sum, row) => sum + Number(row.TotalExcludingVAT), 0),
    grossProfit: consultancyRows.reduce((sum, row) => sum + Number(row.ContributionValue), 0),
  };
}

export async function syncCustomerInvoices() {
  const supabase = createAdminClient();
  let synced = 0;
  let skippedCancelled = 0;

  // Detail-fetching every invoice on every sync would be wasteful (one extra Fortnox
  // call per invoice) — only invoices with no gross_profit recorded yet need it. On an
  // ongoing basis that's just the trickle of new invoices; the very first run after this
  // ships will detail-fetch the entire historical backlog once (run that manually, not
  // via cron, to stay clear of Vercel's 60s function timeout).
  const existing = await fetchAllRows<ExistingClassification>((from, to) =>
    supabase
      .from("customer_invoices")
      .select("fortnox_doc_number, gross_profit, net_total, consultancy_total, consultancy_net_total, consultancy_gross_profit")
      .range(from, to),
  );
  const classified = new Map(existing.map((row) => [row.fortnox_doc_number, row]));

  for await (const batch of fortnoxPaginate<"Invoices", FortnoxInvoice>("/invoices", "Invoices")) {
    const active = batch.filter((inv) => !inv.Cancelled);
    skippedCancelled += batch.length - active.length;
    if (active.length === 0) continue;

    const needsDetail = active.filter((inv) => {
      const prior = classified.get(inv.DocumentNumber);
      return !prior || prior.gross_profit == null || prior.net_total == null || prior.consultancy_total == null;
    });
    const details = await fortnoxGetDetails<"Invoice", FortnoxInvoiceDetail>(
      needsDetail.map((inv) => `/invoices/${inv.DocumentNumber}`),
      "Invoice",
    );
    const detailByDoc = new Map(needsDetail.map((inv, i) => [inv.DocumentNumber, details[i]]));

    const rows = active.map((inv) => {
      const prior = classified.get(inv.DocumentNumber);
      const detail = detailByDoc.get(inv.DocumentNumber);
      const grossProfit = detail ? detail.ContributionValue : prior?.gross_profit ?? null;
      const netTotal = detail ? detail.Net : prior?.net_total ?? null;
      const consultancy = detail ? sumConsultancyRows(detail.InvoiceRows) : null;
      return {
        fortnox_doc_number: inv.DocumentNumber,
        customer_number: inv.CustomerNumber,
        customer_name: inv.CustomerName,
        invoice_date: inv.InvoiceDate,
        due_date: inv.DueDate,
        total: inv.Total,
        balance: inv.Balance,
        paid_date: inv.FinalPayDate,
        gross_profit: grossProfit,
        net_total: netTotal,
        consultancy_total: consultancy ? consultancy.total : prior?.consultancy_total ?? null,
        consultancy_net_total: consultancy ? consultancy.netTotal : prior?.consultancy_net_total ?? null,
        consultancy_gross_profit: consultancy ? consultancy.grossProfit : prior?.consultancy_gross_profit ?? null,
      };
    });

    const { error } = await supabase
      .from("customer_invoices")
      .upsert(rows, { onConflict: "fortnox_doc_number" });
    if (error) throw new Error(`Failed to upsert customer invoices: ${error.message}`);
    synced += rows.length;
  }

  return { synced, skippedCancelled };
}
