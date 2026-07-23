import type { FactoringLimits } from "@/lib/factoring/limits";

export type InvoiceForPromotion = {
  id: string;
  fortnox_doc_number: string;
  customer_number: string | null;
  invoice_date: string;
  due_date: string;
  eligible_amount: number;
  excluded_amount: number;
  // Per-customer average due-to-paid delay when available, else the global fallback —
  // resolved by the caller (cashEvents.ts) since it's the one with access to both stats.
  delayDays: number;
};

export type Promotion = { amount: number; date: string };

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() + Math.round(days));
  return d.toISOString().slice(0, 10);
}

// Forward-time simulation of the revolving pool: as currently-eligible invoices settle
// (freeing their slice of the pool/customer cap), the next currently-excluded invoice in
// FIFO order gets promoted into the 70/30 split — same three-way cap formula
// reallocateFactoring() uses for today's snapshot, just re-applied at each future release
// instead of once. Invoices already flagged by a factoring_manual_overrides entry must be
// excluded from the caller before this runs (they neither consume nor free capacity).
export function simulatePromotions(
  unpaidInvoices: InvoiceForPromotion[],
  limits: FactoringLimits,
  today: string,
): Map<string, Promotion[]> {
  const customerKeyOf = (inv: InvoiceForPromotion) => inv.customer_number ?? inv.fortnox_doc_number;

  let poolUsed = 0;
  const customerUsed = new Map<string, number>();
  for (const inv of unpaidInvoices) {
    if (inv.eligible_amount > 0) {
      poolUsed += inv.eligible_amount;
      const key = customerKeyOf(inv);
      customerUsed.set(key, (customerUsed.get(key) ?? 0) + inv.eligible_amount);
    }
  }

  // An already-eligible invoice can be overdue (due_date+avgDelay already behind us) while
  // still unpaid — clamp its release to today rather than a past date, otherwise the
  // promotion it triggers would inherit that backdated date and get silently dropped by the
  // projection (which ignores anything before today) — exactly the bug this simulation
  // exists to avoid.
  const releases = unpaidInvoices
    .filter((inv) => inv.eligible_amount > 0)
    .map((inv) => {
      const naturalDate = addDays(inv.due_date, inv.delayDays);
      return { date: naturalDate < today ? today : naturalDate, amount: inv.eligible_amount, customerKey: customerKeyOf(inv) };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  // FIFO order matches reallocateFactoring(): invoice_date asc, fortnox_doc_number tie-break.
  const queue = unpaidInvoices
    .filter((inv) => inv.excluded_amount > 0)
    .sort((a, b) => a.invoice_date.localeCompare(b.invoice_date) || a.fortnox_doc_number.localeCompare(b.fortnox_doc_number))
    .map((inv) => ({ inv, remaining: inv.excluded_amount, naturalDate: addDays(inv.due_date, inv.delayDays) }));

  // A single invoice can be promoted in more than one increment (partial fill now,
  // more once further capacity frees later) — keep each increment as its own dated
  // tranche rather than merging into one, so a later increment isn't misattributed to
  // an earlier promotion date.
  const promotions = new Map<string, Promotion[]>();
  const alreadyPromoted = new Map<string, number>();

  function tryPromote(atDate: string) {
    for (const item of queue) {
      if (item.remaining <= 0) continue;
      if (atDate > item.naturalDate) continue; // settles naturally at 100%, no longer promotable

      const key = customerKeyOf(item.inv);
      const promotedSoFar = alreadyPromoted.get(item.inv.id) ?? 0;
      const invoiceRoom = limits.invoiceCap - item.inv.eligible_amount - promotedSoFar;
      const poolRoom = limits.pool - poolUsed;
      const customerRoom = limits.customerCap - (customerUsed.get(key) ?? 0);
      const grant = Math.max(0, Math.min(item.remaining, invoiceRoom, poolRoom, customerRoom));
      if (grant <= 0) continue;

      poolUsed += grant;
      customerUsed.set(key, (customerUsed.get(key) ?? 0) + grant);
      item.remaining -= grant;
      alreadyPromoted.set(item.inv.id, promotedSoFar + grant);

      const tranches = promotions.get(item.inv.id) ?? [];
      tranches.push({ amount: grant, date: atDate });
      promotions.set(item.inv.id, tranches);
    }
  }

  for (const release of releases) {
    poolUsed -= release.amount;
    customerUsed.set(release.customerKey, (customerUsed.get(release.customerKey) ?? 0) - release.amount);
    tryPromote(release.date);
  }

  return promotions;
}
