import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import { fetchItRevenueLines } from "@/lib/it/revenueSync";

// Keeps it_revenue_lines current. Invoices are final once issued, so already-stored ones
// are skipped -- a normal run is just the two article-filtered list calls plus a detail
// fetch for any invoice new since last time. The very first run backfills the whole history.
export async function syncItRevenue() {
  const supabase = createAdminClient();
  const existing = await fetchAllRows<{ fortnox_doc_number: string }>((from, to) =>
    supabase.from("it_revenue_lines").select("fortnox_doc_number").range(from, to),
  );
  const lines = await fetchItRevenueLines(new Set(existing.map((r) => r.fortnox_doc_number)));
  if (lines.length === 0) return { synced: 0 };

  const { error } = await supabase.from("it_revenue_lines").upsert(lines, { onConflict: "fortnox_doc_number,article_number" });
  if (error) throw new Error(`Failed to upsert IT revenue lines: ${error.message}`);
  return { synced: lines.length };
}
