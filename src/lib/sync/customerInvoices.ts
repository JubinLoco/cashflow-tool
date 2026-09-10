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
// Row-level Total/TotalExcludingVAT/ContributionValue/DeliveredQuantity all come back as
// strings. Description/DeliveredQuantity are used for battery-recycling weight tracking
// (see batteryDetection.ts) -- confirmed against a real invoice (2026-09-10): the
// description field is "Description", not "ArticleDescription", and quantity is
// "DeliveredQuantity", not "Quantity" -- an earlier version of this code used the wrong
// names and silently matched zero battery rows as a result.
type FortnoxInvoiceRow = {
  ArticleNumber: string;
  Description: string;
  DeliveredQuantity: string;
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
    .filter((row) => isBatteryArticle(row.Description))
    .map((row) => ({
      article_number: row.ArticleNumber,
      article_description: row.Description,
      quantity: Number(row.DeliveredQuantity),
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

// battery_check_done was added long after gross_profit/consultancy_total, so unlike
// those (which only ever need to catch up on a trickle of new invoices), it initially
// applies to the ENTIRE historical backlog at once (thousands of invoices) -- doing that
// in one sync run overwhelmed Fortnox's rate limit badly enough that even fetchWithRetry's
// backoff couldn't recover (observed: failed on the ~28th invoice, exhausting retries).
// Capping how many *purely-for-battery-check* invoices get pulled into a single run keeps
// the added volume modest; the rest catch up over however many subsequent runs it takes
// (manual "Sync now" clicks or the daily cron) -- same "spread it over multiple runs
// rather than one big one" philosophy as this file's other timeout-avoidance comments.
const BATTERY_BACKFILL_LIMIT_PER_RUN = 150;

// Narrows the battery-check backlog at the source rather than just rationing it: DSEG
// didn't sell batteries before mid-2023, and a battery unit alone runs well into the tens
// of thousands of SEK (e.g. a real one seen at sync time: 47,999 SEK), so an invoice under
// 15,000 SEK total can't possibly contain one. Cuts the real backlog from ~5,300 to ~1,500
// invoices (checked against production data, 2026-09-10). An invoice outside this window
// is marked battery_check_done immediately, without ever spending a Fortnox call on it.
const BATTERY_CHECK_MIN_DATE = "2023-06-01";
const BATTERY_CHECK_MIN_TOTAL = 15_000;

function isEligibleForBatteryCheck(inv: FortnoxInvoice): boolean {
  return inv.InvoiceDate >= BATTERY_CHECK_MIN_DATE && inv.Total >= BATTERY_CHECK_MIN_TOTAL;
}

export async function syncCustomerInvoices() {
  const supabase = createAdminClient();
  let synced = 0;
  let skippedCancelled = 0;
  let batteryBackfillRemaining = BATTERY_BACKFILL_LIMIT_PER_RUN;

  // Detail-fetching every invoice on every sync would be wasteful (one extra Fortnox
  // call per invoice) — only invoices with no gross_profit recorded yet need it. On an
  // ongoing basis that's just the trickle of new invoices; the very first run after this
  // ships will detail-fetch the entire historical backlog once (run that manually, not
  // via cron, to stay clear of Vercel's 60s function timeout).
  const existing = await fetchAllRows<ExistingClassification>((from, to) =>
    supabase
      .from("customer_invoices")
      .select(
        "fortnox_doc_number, gross_profit, net_total, consultancy_total, consultancy_net_total, consultancy_gross_profit, battery_check_done",
      )
      .range(from, to),
  );
  const classified = new Map(existing.map((row) => [row.fortnox_doc_number, row]));

  // Newest-first: the battery backfill cap below only affords ~150 detail-fetches per run
  // purely for battery_check_done, and El-Kretsen reporting cares about recent months far
  // more than 2020-era invoices -- oldest-first (Fortnox's default) would spend that
  // budget on the least useful invoices for ~35 runs before reaching anything recent.
  for await (const batch of fortnoxPaginate<"Invoices", FortnoxInvoice>(
    "/invoices?sortby=documentnumber&sortorder=descending",
    "Invoices",
  )) {
    const active = batch.filter((inv) => !inv.Cancelled);
    skippedCancelled += batch.length - active.length;
    if (active.length === 0) continue;

    const needsDetail = active.filter((inv) => {
      const prior = classified.get(inv.DocumentNumber);
      const needsCoreFields = !prior || prior.gross_profit == null || prior.net_total == null || prior.consultancy_total == null;
      if (needsCoreFields) return true;
      if (!prior.battery_check_done && isEligibleForBatteryCheck(inv) && batteryBackfillRemaining > 0) {
        batteryBackfillRemaining--;
        return true;
      }
      return false;
    });

    // A rate-limit failure here (exhausted retries) shouldn't take down the whole sync --
    // skip refreshing this page's detail-dependent fields and move on; every invoice in it
    // keeps its prior cached values (or null-with-battery_check_done-still-false, so it's
    // retried on the next run) rather than the entire multi-page sync aborting partway.
    let details: FortnoxInvoiceDetail[] = [];
    try {
      details = await fortnoxGetDetails<"Invoice", FortnoxInvoiceDetail>(
        needsDetail.map((inv) => `/invoices/${inv.DocumentNumber}`),
        "Invoice",
      );
    } catch (err) {
      console.error(`Detail fetch failed for a batch of ${needsDetail.length} invoices, skipping this page: ${(err as Error).message}`);
    }
    const detailByDoc = new Map(details.length === needsDetail.length ? needsDetail.map((inv, i) => [inv.DocumentNumber, details[i]]) : []);

    const batteryLinesByDoc = new Map<string, BatteryLine[]>();
    for (const [docNumber, detail] of detailByDoc) {
      // Detail may have been fetched for an ineligible invoice too (e.g. it separately
      // needed core fields) -- don't bother extracting battery data for one outside the
      // date/amount window either way.
      const inv = active.find((i) => i.DocumentNumber === docNumber)!;
      if (!isEligibleForBatteryCheck(inv)) continue;
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
        // An invoice outside the date/amount window is resolved immediately -- it will
        // never need a real check, so there's no reason to keep re-evaluating it on every
        // future sync run.
        battery_check_done: !isEligibleForBatteryCheck(inv) ? true : detail ? true : (prior?.battery_check_done ?? false),
      };
    });

    const { error } = await supabase
      .from("customer_invoices")
      .upsert(rows, { onConflict: "fortnox_doc_number" });
    if (error) throw new Error(`Failed to upsert customer invoices: ${error.message}`);
    synced += rows.length;

    if (batteryLinesByDoc.size > 0) {
      const models = new Map<string, string>();
      // Keyed by "docNumber|articleNumber" and summed -- the same article number can
      // appear on more than one line of the same invoice (observed in practice), and a
      // batch upsert with a duplicate conflict key within itself fails outright
      // ("ON CONFLICT DO UPDATE command cannot affect row a second time").
      const saleLinesByKey = new Map<
        string,
        { fortnox_doc_number: string; article_number: string; article_description: string; quantity: number; invoice_date: string }
      >();
      for (const [docNumber, lines] of batteryLinesByDoc) {
        const invoiceDate = active.find((inv) => inv.DocumentNumber === docNumber)!.InvoiceDate;
        for (const line of lines) {
          models.set(line.article_number, line.article_description);
          const key = `${docNumber}|${line.article_number}`;
          const existingLine = saleLinesByKey.get(key);
          if (existingLine) {
            existingLine.quantity += line.quantity;
          } else {
            saleLinesByKey.set(key, {
              fortnox_doc_number: docNumber,
              article_number: line.article_number,
              article_description: line.article_description,
              quantity: line.quantity,
              invoice_date: invoiceDate,
            });
          }
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
        .upsert([...saleLinesByKey.values()], { onConflict: "fortnox_doc_number,article_number" });
      if (linesError) throw new Error(`Failed to upsert battery sale lines: ${linesError.message}`);
    }
  }

  return { synced, skippedCancelled };
}
