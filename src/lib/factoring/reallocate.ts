import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import { loadFactoringLimits } from "@/lib/factoring/limits";

const UPDATE_BATCH_SIZE = 500;

type InvoiceForAllocation = {
  id: string;
  fortnox_doc_number: string;
  customer_number: string | null;
  total: number;
};

// Full FIFO recompute over currently-unpaid invoices against the live pool +
// per-customer capacity. Recomputing from scratch every run (rather than tracking
// a waitlist) is what naturally promotes previously-excluded amounts once older
// invoices get paid off and free up capacity.
export async function reallocateFactoring() {
  const supabase = createAdminClient();

  const { pool, invoiceCap, customerCap } = await loadFactoringLimits(supabase);

  const unpaid = await fetchAllRows<InvoiceForAllocation>((from, to) =>
    supabase
      .from("customer_invoices")
      .select("id, fortnox_doc_number, customer_number, total")
      .gt("balance", 0)
      .order("invoice_date", { ascending: true })
      .order("fortnox_doc_number", { ascending: true })
      .range(from, to),
  );

  // Real per-invoice eligibility reports from the factoring company (disputes,
  // bankruptcy, rejected payment terms, etc.) override our own FIFO simulation for
  // specific invoices — those reasons aren't something a pool-cap simulation can know.
  const overrides = await fetchAllRows<{ fortnox_doc_number: string; treatment: string }>((from, to) =>
    supabase.from("factoring_manual_overrides").select("fortnox_doc_number, treatment").range(from, to),
  );
  const overrideByDocNumber = new Map(overrides.map((o) => [o.fortnox_doc_number, o.treatment]));

  const customerUsed = new Map<string, number>();
  let poolUsed = 0;
  const updates: { id: string; fortnox_doc_number: string; eligible_amount: number; excluded_amount: number }[] = [];

  for (const inv of unpaid) {
    const override = overrideByDocNumber.get(inv.fortnox_doc_number);
    if (override) {
      // Not run through the FIFO pool/customer caps at all — a manually confirmed
      // exception doesn't consume (or free up) simulated capacity for other invoices.
      updates.push({
        id: inv.id,
        fortnox_doc_number: inv.fortnox_doc_number,
        eligible_amount: 0,
        excluded_amount: override === "full_amount_on_payment" ? inv.total : 0,
      });
      continue;
    }

    const customerKey = inv.customer_number ?? inv.fortnox_doc_number;
    const customerRemaining = customerCap - (customerUsed.get(customerKey) ?? 0);
    const poolRemaining = pool - poolUsed;
    const cappedByInvoice = Math.min(inv.total, invoiceCap);
    const eligible = Math.max(0, Math.min(cappedByInvoice, poolRemaining, customerRemaining));

    poolUsed += eligible;
    customerUsed.set(customerKey, (customerUsed.get(customerKey) ?? 0) + eligible);
    updates.push({
      id: inv.id,
      fortnox_doc_number: inv.fortnox_doc_number,
      eligible_amount: eligible,
      excluded_amount: inv.total - eligible,
    });
  }

  // Paid invoices are already settled — the live pool/customer caps no longer apply to
  // them (that history isn't reconstructed), only the fixed per-invoice cap is meaningful.
  const paid = await fetchAllRows<{ id: string; fortnox_doc_number: string; total: number }>((from, to) =>
    supabase.from("customer_invoices").select("id, fortnox_doc_number, total").lte("balance", 0).range(from, to),
  );

  for (const inv of paid) {
    const eligible = Math.min(inv.total, invoiceCap);
    updates.push({
      id: inv.id,
      fortnox_doc_number: inv.fortnox_doc_number,
      eligible_amount: eligible,
      excluded_amount: inv.total - eligible,
    });
  }

  for (let i = 0; i < updates.length; i += UPDATE_BATCH_SIZE) {
    const batch = updates.slice(i, i + UPDATE_BATCH_SIZE);
    const { error } = await supabase.from("customer_invoices").upsert(batch, { onConflict: "id" });
    if (error) throw new Error(`Failed to update invoice batch: ${error.message}`);
  }

  return { unpaidCount: unpaid.length, paidCount: paid.length, poolUsed, pool };
}
