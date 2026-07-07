import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetchAll";

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
  const today = new Date().toISOString().slice(0, 10);

  const { data: limitsRows, error: limitsError } = await supabase
    .from("factoring_facility_limits")
    .select("*")
    .lte("effective_from", today)
    .order("effective_from", { ascending: false })
    .limit(1);
  if (limitsError) throw new Error(`Failed to load facility limits: ${limitsError.message}`);
  const limits = limitsRows?.[0];
  if (!limits) throw new Error("No factoring_facility_limits row found");

  const pool = limits.total_eligible_credit;
  const invoiceCap = pool * limits.invoice_cap_pct;
  const customerCap = pool * limits.customer_cap_pct;

  const unpaid = await fetchAllRows<InvoiceForAllocation>((from, to) =>
    supabase
      .from("customer_invoices")
      .select("id, fortnox_doc_number, customer_number, total")
      .gt("balance", 0)
      .order("invoice_date", { ascending: true })
      .order("fortnox_doc_number", { ascending: true })
      .range(from, to),
  );

  const customerUsed = new Map<string, number>();
  let poolUsed = 0;
  const updates: { id: string; fortnox_doc_number: string; eligible_amount: number; excluded_amount: number }[] = [];

  for (const inv of unpaid) {
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
