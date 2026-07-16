import { createAdminClient } from "@/lib/supabase/admin";

export type FactoringLimits = {
  pool: number;
  invoiceCap: number;
  customerCap: number;
};

// Shared by reallocateFactoring() (today's snapshot) and simulatePromotions()
// (forward-time simulation) so the pool/cap figures can never drift between the two.
export async function loadFactoringLimits(supabase: ReturnType<typeof createAdminClient>): Promise<FactoringLimits> {
  const today = new Date().toISOString().slice(0, 10);
  const { data: limitsRows, error } = await supabase
    .from("factoring_facility_limits")
    .select("*")
    .lte("effective_from", today)
    .order("effective_from", { ascending: false })
    .limit(1);
  if (error) throw new Error(`Failed to load facility limits: ${error.message}`);
  const limits = limitsRows?.[0];
  if (!limits) throw new Error("No factoring_facility_limits row found");

  return {
    pool: limits.total_eligible_credit,
    invoiceCap: limits.total_eligible_credit * limits.invoice_cap_pct,
    customerCap: limits.total_eligible_credit * limits.customer_cap_pct,
  };
}
