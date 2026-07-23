import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetchAll";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function computeStats(delays: number[]): { avg: number; median: number } {
  const sorted = [...delays].sort((a, b) => a - b);
  const avg = sorted.reduce((sum, d) => sum + d, 0) / sorted.length;
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return { avg, median };
}

export async function computePaymentDelayStats() {
  const supabase = createAdminClient();
  const data = await fetchAllRows<{ due_date: string; paid_date: string; customer_number: string | null }>((from, to) =>
    supabase
      .from("customer_invoices")
      .select("due_date, paid_date, customer_number")
      .not("paid_date", "is", null)
      .range(from, to),
  );

  const delayOf = (row: { due_date: string; paid_date: string }) =>
    (new Date(row.paid_date).getTime() - new Date(row.due_date).getTime()) / MS_PER_DAY;

  if (data.length === 0) {
    return { sampleSize: 0, customersComputed: 0 };
  }

  const { avg, median } = computeStats(data.map(delayOf));

  // Recomputed fresh each run — no need to diff against the previous stats.
  await supabase.from("payment_delay_stats").delete().not("id", "is", null);
  const { error: insertError } = await supabase.from("payment_delay_stats").insert({
    avg_days_due_to_paid: avg,
    median_days_due_to_paid: median,
    sample_size: data.length,
  });
  if (insertError) throw new Error(`Failed to store payment delay stats: ${insertError.message}`);

  const byCustomer = new Map<string, number[]>();
  for (const row of data) {
    if (!row.customer_number) continue; // no customer to group by — falls back to the global figure downstream
    const delays = byCustomer.get(row.customer_number) ?? [];
    delays.push(delayOf(row));
    byCustomer.set(row.customer_number, delays);
  }
  const customerRows = Array.from(byCustomer.entries()).map(([customer_number, delays]) => {
    const stats = computeStats(delays);
    return {
      customer_number,
      avg_days_due_to_paid: stats.avg,
      median_days_due_to_paid: stats.median,
      sample_size: delays.length,
    };
  });

  await supabase.from("customer_payment_delay_stats").delete().not("customer_number", "is", null);
  if (customerRows.length > 0) {
    const { error: customerError } = await supabase.from("customer_payment_delay_stats").insert(customerRows);
    if (customerError) throw new Error(`Failed to store customer payment delay stats: ${customerError.message}`);
  }

  return { sampleSize: data.length, avgDaysDueToPaid: avg, medianDaysDueToPaid: median, customersComputed: customerRows.length };
}
