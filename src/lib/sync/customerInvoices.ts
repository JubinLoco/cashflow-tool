import { fortnoxPaginate, fortnoxGetDetails } from "@/lib/fortnox/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import { CONSULTANCY_ARTICLE_NUMBERS } from "@/lib/sales/businessLine";
import { isBatteryArticle } from "@/lib/sales/batteryDetection";

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
// ArticleDescription/Quantity are used for battery-recycling weight tracking (see
// batteryDetection.ts) -- unlike the other row fields, these were never read before, so
// it's worth double-checking their real values against an actual synced invoice.
type FortnoxInvoiceRow = {
  ArticleNumber: string;
  ArticleDescription: string;
  Quantity: number;
  Total: string;
  TotalExcludingVAT: string;
  ContributionValue: string;
};
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
  battery_check_done: boolean;
};

type BatteryLine = { article_number: string; article_description: string; quantity: number };

function extractBatteryRows(rows: FortnoxInvoiceRow[]): BatteryLine[] {
  return rows
    .filter((row) => isBatteryArticle(row.ArticleDescription))
    .map((row) => ({
      article_number: row.ArticleNumber,
      article_description: row.ArticleDescription,
      quantity: row.Quantity,
    }));
}

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
  // via cron, to stay clear of Vercel's 60s function timeout). battery_check_done follows
  // the same rule -- added later than the other fields, so it drives one more full
  // historical detail-refetch pass the first time this runs, same as any new field here.
  const existing = await fetchAllRows<ExistingClassification>((from, to) =>
    supabase
      .from("customer_invoices")
      .select(
        "fortnox_doc_number, gross_profit, net_total, consultancy_total, consultancy_net_total, consultancy_gross_profit, battery_check_done",
      )
      .range(from, to),
  );
  const classified = new Map(existing.map((row) => [row.fortnox_doc_number, row]));

  for await (const batch of fortnoxPaginate<"Invoices", FortnoxInvoice>("/invoices", "Invoices")) {
    const active = batch.filter((inv) => !inv.Cancelled);
    skippedCancelled += batch.length - active.length;
    if (active.length === 0) continue;

    const needsDetail = active.filter((inv) => {
      const prior = classified.get(inv.DocumentNumber);
      return !prior || prior.gross_profit == null || prior.net_total == null || prior.consultancy_total == null || !prior.battery_check_done;
    });
    const details = await fortnoxGetDetails<"Invoice", FortnoxInvoiceDetail>(
      needsDetail.map((inv) => `/invoices/${inv.DocumentNumber}`),
      "Invoice",
    );
    const detailByDoc = new Map(needsDetail.map((inv, i) => [inv.DocumentNumber, details[i]]));

    const batteryLinesByDoc = new Map<string, BatteryLine[]>();
    for (const [docNumber, detail] of detailByDoc) {
      const batteryLines = extractBatteryRows(detail.InvoiceRows);
      if (batteryLines.length > 0) batteryLinesByDoc.set(docNumber, batteryLines);
    }

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
        battery_check_done: detail ? true : (prior?.battery_check_done ?? false),
      };
    });

    const { error } = await supabase
      .from("customer_invoices")
      .upsert(rows, { onConflict: "fortnox_doc_number" });
    if (error) throw new Error(`Failed to upsert customer invoices: ${error.message}`);
    synced += rows.length;

    if (batteryLinesByDoc.size > 0) {
      const models = new Map<string, string>();
      const saleLineRows: { fortnox_doc_number: string; article_number: string; article_description: string; quantity: number; invoice_date: string }[] = [];
      for (const [docNumber, lines] of batteryLinesByDoc) {
        const invoiceDate = active.find((inv) => inv.DocumentNumber === docNumber)!.InvoiceDate;
        for (const line of lines) {
          models.set(line.article_number, line.article_description);
          saleLineRows.push({
            fortnox_doc_number: docNumber,
            article_number: line.article_number,
            article_description: line.article_description,
            quantity: line.quantity,
            invoice_date: invoiceDate,
          });
        }
      }

      // Ignore-on-conflict: a previously-set weight_kg must never be overwritten by a
      // re-sync, only the description is worth refreshing on genuinely new models.
      const { error: modelsError } = await supabase
        .from("battery_models")
        .upsert(
          [...models.entries()].map(([article_number, article_description]) => ({ article_number, article_description })),
          { onConflict: "article_number", ignoreDuplicates: true },
        );
      if (modelsError) throw new Error(`Failed to upsert battery models: ${modelsError.message}`);

      const { error: linesError } = await supabase
        .from("battery_sale_lines")
        .upsert(saleLineRows, { onConflict: "fortnox_doc_number,article_number" });
      if (linesError) throw new Error(`Failed to upsert battery sale lines: ${linesError.message}`);
    }
  }

  return { synced, skippedCancelled };
}
