import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetchAll";

const INSERT_BATCH_SIZE = 1000;

type InvoiceForCashEvents = {
  id: string;
  invoice_date: string;
  due_date: string;
  balance: number;
  paid_date: string | null;
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

  const invoices = await fetchAllRows<InvoiceForCashEvents>((from, to) =>
    supabase
      .from("customer_invoices")
      .select("id, invoice_date, due_date, balance, paid_date, eligible_amount, excluded_amount")
      .range(from, to),
  );

  const events: CashEventRow[] = [];

  for (const inv of invoices) {
    const isPaid = inv.balance <= 0 && Boolean(inv.paid_date);
    const settlementDate = isPaid ? inv.paid_date! : addDays(inv.due_date, avgDelay);
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
      events.push({
        source_invoice_id: inv.id,
        tranche: "c",
        amount: round2(inv.excluded_amount),
        event_date: settlementDate,
        is_estimated: isEstimated,
      });
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
