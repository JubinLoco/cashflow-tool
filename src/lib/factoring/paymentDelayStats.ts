import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetchAll";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export async function computePaymentDelayStats() {
  const supabase = createAdminClient();
  const data = await fetchAllRows<{ due_date: string; paid_date: string }>((from, to) =>
    supabase
      .from("customer_invoices")
      .select("due_date, paid_date")
      .not("paid_date", "is", null)
      .range(from, to),
  );

  const delays = data
    .map((row) => (new Date(row.paid_date!).getTime() - new Date(row.due_date).getTime()) / MS_PER_DAY)
    .sort((a, b) => a - b);

  if (delays.length === 0) {
    return { sampleSize: 0 };
  }

  const avg = delays.reduce((sum, d) => sum + d, 0) / delays.length;
  const mid = Math.floor(delays.length / 2);
  const median = delays.length % 2 === 0 ? (delays[mid - 1] + delays[mid]) / 2 : delays[mid];

  // Recomputed fresh each run — no need to diff against the previous stats.
  await supabase.from("payment_delay_stats").delete().not("id", "is", null);
  const { error: insertError } = await supabase.from("payment_delay_stats").insert({
    avg_days_due_to_paid: avg,
    median_days_due_to_paid: median,
    sample_size: delays.length,
  });
  if (insertError) throw new Error(`Failed to store payment delay stats: ${insertError.message}`);

  return { sampleSize: delays.length, avgDaysDueToPaid: avg, medianDaysDueToPaid: median };
}
