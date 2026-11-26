import { fortnoxPaginate, fortnoxGetDetails } from "@/lib/fortnox/client";
import { IT_ARTICLE_NUMBERS, IT_REVENUE_FROM_DATE } from "@/lib/it/config";

type FortnoxInvoiceHeader = { DocumentNumber: string; CustomerName: string; InvoiceDate: string; Cancelled: boolean };
type FortnoxInvoiceRow = {
  ArticleNumber: string;
  Description: string;
  DeliveredQuantity: string;
  TotalExcludingVAT: string;
};
type FortnoxInvoiceDetail = { InvoiceRows: FortnoxInvoiceRow[] };

export type ItRevenueLine = {
  fortnox_doc_number: string;
  article_number: string;
  customer_name: string;
  invoice_date: string;
  article_description: string;
  quantity: number;
  net_amount: number;
};

// The invoice LIST endpoint accepts an `articlenumber` filter, so only invoices that
// actually carry one of the IT articles need a detail fetch (rows/amounts only come back
// from the per-invoice detail endpoint) -- a few dozen, not the whole invoice history.
// `skipDocs` lets the regular sync skip invoices already stored (invoices are final once
// issued), so a normal run costs just the list calls plus any new invoice.
export async function fetchItRevenueLines(skipDocs: Set<string> = new Set()): Promise<ItRevenueLine[]> {
  const headers = new Map<string, FortnoxInvoiceHeader>();
  for (const article of IT_ARTICLE_NUMBERS) {
    for await (const batch of fortnoxPaginate<"Invoices", FortnoxInvoiceHeader>(
      `/invoices?articlenumber=${encodeURIComponent(article)}&fromdate=${IT_REVENUE_FROM_DATE}`,
      "Invoices",
    )) {
      for (const inv of batch) if (!inv.Cancelled && !skipDocs.has(inv.DocumentNumber)) headers.set(inv.DocumentNumber, inv);
    }
  }
  const docs = [...headers.keys()];
  if (docs.length === 0) return [];

  const details = await fortnoxGetDetails<"Invoice", FortnoxInvoiceDetail>(docs.map((d) => `/invoices/${d}`), "Invoice");

  const lines = new Map<string, ItRevenueLine>();
  docs.forEach((doc, i) => {
    const header = headers.get(doc)!;
    for (const row of details[i].InvoiceRows) {
      if (!IT_ARTICLE_NUMBERS.includes(row.ArticleNumber)) continue;
      // The same article can appear on several lines of one invoice -- sum them (a batch
      // upsert can't contain the same conflict key twice).
      const key = `${doc}|${row.ArticleNumber}`;
      const existing = lines.get(key);
      const net = Number(row.TotalExcludingVAT) || 0;
      const qty = Number(row.DeliveredQuantity) || 0;
      if (existing) {
        existing.net_amount += net;
        existing.quantity += qty;
      } else {
        lines.set(key, {
          fortnox_doc_number: doc,
          article_number: row.ArticleNumber,
          customer_name: header.CustomerName,
          invoice_date: header.InvoiceDate,
          article_description: row.Description,
          quantity: qty,
          net_amount: net,
        });
      }
    }
  });
  return [...lines.values()];
}
