import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import { loadFactoringLimits } from "@/lib/factoring/limits";
import { simulatePromotions, type InvoiceForPromotion } from "@/lib/factoring/poolPromotion";

const INSERT_BATCH_SIZE = 1000;
// Below this many historical paid invoices, a customer's own average is too noisy to
// trust over the global figure (e.g. a single early/late payment would swing it wildly).
const MIN_CUSTOMER_SAMPLE_SIZE = 3;

type InvoiceForCashEvents = {
  id: string;
  fortnox_doc_number: string;
  customer_number: string | null;
  invoice_date: string;
  due_date: string;
  balance: number;
  paid_date: string | null;
  manual_paid: boolean | null;
  eligible_amount: number;
  excluded_amount: number;
};

type CashEventRow = {
  source_invoice_id: string;
  tranche: "a" | "b" | "c";
  amount: number;
  event_date: string;
  is_estimated: boolean;
};

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() + Math.round(days));
  return d.toISOString().slice(0, 10);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Full recompute every run: wipe and regenerate cash_events for every invoice. Simpler
// than diffing which invoices changed since the last reallocation, and cheap at this scale.
export async function generateCashEvents() {
  const supabase = createAdminClient();

  const { data: rules, error: rulesError } = await supabase
    .from("factoring_rules")
    .select("*")
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (rulesError || !rules) {
    throw new Error(`Failed to load factoring rules: ${rulesError?.message ?? "no rules row found"}`);
  }

  const { data: delayStats } = await supabase
    .from("payment_delay_stats")
    .select("avg_days_due_to_paid")
    .order("computed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const avgDelay = delayStats?.avg_days_due_to_paid ?? 0;

  // Some customers pay reliably faster/slower than the company-wide average — use each
  // customer's own history where there's enough of it, falling back to the global figure
  // otherwise (new customers, or ones with too few paid invoices to trust their own average).
  const { data: customerDelayRows } = await supabase
    .from("customer_payment_delay_stats")
    .select("customer_number, avg_days_due_to_paid, sample_size");
  const customerDelay = new Map(
    (customerDelayRows ?? [])
      .filter((r) => r.sample_size >= MIN_CUSTOMER_SAMPLE_SIZE)
      .map((r) => [r.customer_number, r.avg_days_due_to_paid]),
  );
  function delayFor(customerNumber: string | null): number {
    if (customerNumber && customerDelay.has(customerNumber)) return customerDelay.get(customerNumber)!;
    return avgDelay;
  }

  const invoices = await fetchAllRows<InvoiceForCashEvents>((from, to) =>
    supabase
      .from("customer_invoices")
      .select(
        "id, fortnox_doc_number, customer_number, invoice_date, due_date, balance, paid_date, manual_paid, eligible_amount, excluded_amount",
      )
      .range(from, to),
  );

  // Excluded amounts aren't permanently excluded — as currently-eligible invoices settle
  // and free up pool/customer capacity, the next excluded invoice in FIFO order should get
  // promoted into the 70/30 split sooner than its own due date. Manual overrides neither
  // consume nor free simulated capacity, so they're excluded from the simulation entirely
  // (their excluded_amount below is left untouched, same as reallocateFactoring()).
  const overrides = await fetchAllRows<{ fortnox_doc_number: string }>((from, to) =>
    supabase.from("factoring_manual_overrides").select("fortnox_doc_number").range(from, to),
  );
  const overrideDocNumbers = new Set(overrides.map((o) => o.fortnox_doc_number));

  const limits = await loadFactoringLimits(supabase);
  const unpaidForSimulation: InvoiceForPromotion[] = invoices
    .filter((inv) => inv.balance > 0 && !overrideDocNumbers.has(inv.fortnox_doc_number))
    .map((inv) => ({ ...inv, delayDays: delayFor(inv.customer_number) }));
  const today = new Date().toISOString().slice(0, 10);
  const promotions = simulatePromotions(unpaidForSimulation, limits, today);

  const events: CashEventRow[] = [];

  for (const inv of invoices) {
    // manual_paid overrides the Fortnox-synced balance/paid_date when set, for when the
    // sync hasn't caught up yet — same reasoning as the Verify page's "Mark paid" toggle
    // and the supplier-invoice side of the projection. There's no real paid_date to anchor
    // on yet, so settle "today" rather than projecting it out at the estimated due date —
    // this is a temporary stand-in: once Fortnox actually syncs a real paid_date, the next
    // full recompute picks that up and this override becomes moot (manual_paid survives
    // syncs, but `reallyPaid` then also becomes true, so the real date wins either way).
    const reallyPaid = inv.balance <= 0 && Boolean(inv.paid_date);
    const isPaid = reallyPaid || Boolean(inv.manual_paid);
    const settlementDate = reallyPaid
      ? inv.paid_date!
      : inv.manual_paid
        ? today
        : addDays(inv.due_date, delayFor(inv.customer_number));
    const isEstimated = !isPaid;

    if (inv.eligible_amount > 0) {
      events.push({
        source_invoice_id: inv.id,
        tranche: "a",
        amount: round2(inv.eligible_amount * rules.tranche_a_pct),
        event_date: addDays(inv.invoice_date, rules.tranche_a_days_after_invoice),
        is_estimated: false,
      });
      events.push({
        source_invoice_id: inv.id,
        tranche: "b",
        amount: round2(inv.eligible_amount * rules.tranche_b_pct * (1 - rules.tranche_b_fee_pct)),
        event_date: settlementDate,
        is_estimated: isEstimated,
      });
    }
    if (inv.excluded_amount > 0) {
      const tranches = promotions.get(inv.id);
      if (tranches && tranches.length > 0) {
        let promotedTotal = 0;
        for (const tranche of tranches) {
          promotedTotal += tranche.amount;
          events.push({
            source_invoice_id: inv.id,
            tranche: "a",
            amount: round2(tranche.amount * rules.tranche_a_pct),
            event_date: tranche.date,
            is_estimated: true,
          });
          events.push({
            source_invoice_id: inv.id,
            tranche: "b",
            amount: round2(tranche.amount * rules.tranche_b_pct * (1 - rules.tranche_b_fee_pct)),
            event_date: tranche.date > settlementDate ? tranche.date : settlementDate,
            is_estimated: true,
          });
        }
        const remainder = inv.excluded_amount - promotedTotal;
        if (remainder > 0) {
          events.push({
            source_invoice_id: inv.id,
            tranche: "c",
            amount: round2(remainder),
            event_date: settlementDate,
            is_estimated: isEstimated,
          });
        }
      } else {
        events.push({
          source_invoice_id: inv.id,
          tranche: "c",
          amount: round2(inv.excluded_amount),
          event_date: settlementDate,
          is_estimated: isEstimated,
        });
      }
    }
  }

  const { error: deleteError } = await supabase.from("cash_events").delete().not("id", "is", null);
  if (deleteError) throw new Error(`Failed to clear cash_events: ${deleteError.message}`);

  for (let i = 0; i < events.length; i += INSERT_BATCH_SIZE) {
    const batch = events.slice(i, i + INSERT_BATCH_SIZE);
    const { error } = await supabase.from("cash_events").insert(batch);
    if (error) throw new Error(`Failed to insert cash_events batch: ${error.message}`);
  }

  return { eventsGenerated: events.length, invoicesProcessed: invoices.length };
}
