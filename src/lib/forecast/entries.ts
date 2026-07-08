import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateOccurrenceDates, type RecurrenceUnit } from "@/lib/forecast/recurrence";

export type DateInput =
  | { type: "one_time"; date: string }
  | { type: "recurring"; startDate: string; endDate: string; unit: RecurrenceUnit; n: number };

export async function createForecastEntries(
  table: "sales_forecast" | "purchase_forecast",
  baseFields: Record<string, unknown>,
  dateInput: DateInput,
) {
  const supabase = createAdminClient();

  const rows: (Record<string, unknown> & { expected_date: string; recurring_group_id: string | null })[] =
    dateInput.type === "one_time"
      ? [{ ...baseFields, expected_date: dateInput.date, recurring_group_id: null }]
      : (() => {
          const groupId: string = randomUUID();
          return generateOccurrenceDates(dateInput.startDate, dateInput.unit, dateInput.n, dateInput.endDate).map(
            (expected_date) => ({ ...baseFields, expected_date, recurring_group_id: groupId }),
          );
        })();

  const { data, error } = await supabase.from(table).insert(rows).select();
  if (error) throw new Error(`Failed to create ${table} entries: ${error.message}`);
  return data;
}

// scope "single" deletes just this row. scope "future" deletes this row and every later
// occurrence in its recurring group that's still an open forecast — rows already matched
// to a real invoice represent reality now and are left untouched.
export async function deleteForecastEntry(
  table: "sales_forecast" | "purchase_forecast",
  id: string,
  scope: "single" | "future",
) {
  const supabase = createAdminClient();

  if (scope === "single") {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) throw new Error(`Failed to delete ${table} entry: ${error.message}`);
    return;
  }

  const { data: row, error: fetchError } = await supabase
    .from(table)
    .select("recurring_group_id, expected_date")
    .eq("id", id)
    .single();
  if (fetchError) throw new Error(`Failed to load ${table} entry: ${fetchError.message}`);

  if (!row.recurring_group_id) {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) throw new Error(`Failed to delete ${table} entry: ${error.message}`);
    return;
  }

  const { error } = await supabase
    .from(table)
    .delete()
    .eq("recurring_group_id", row.recurring_group_id)
    .eq("status", "forecast")
    .gte("expected_date", row.expected_date);
  if (error) throw new Error(`Failed to delete ${table} series: ${error.message}`);
}

export type ForecastFieldUpdate = {
  description?: string;
  amount?: number;
  expected_date?: string; // only applied for scope "single" — date defines the recurrence pattern
  extra?: Record<string, unknown>; // product_line or category
};

// scope "single" updates just this row (any field, including date). scope "future" bulk-updates
// description/amount/extra across this row and every later still-open occurrence in the series —
// date is excluded from bulk updates since it's what defines the recurrence, and matched rows are
// left untouched since they represent reality now, mirroring deleteForecastEntry's behavior.
export async function updateForecastEntry(
  table: "sales_forecast" | "purchase_forecast",
  id: string,
  scope: "single" | "future",
  fields: ForecastFieldUpdate,
) {
  const supabase = createAdminClient();

  if (scope === "single") {
    const payload = {
      ...(fields.description !== undefined ? { description: fields.description } : {}),
      ...(fields.amount !== undefined ? { amount: fields.amount } : {}),
      ...(fields.expected_date !== undefined ? { expected_date: fields.expected_date } : {}),
      ...(fields.extra ?? {}),
    };
    const { error } = await supabase.from(table).update(payload).eq("id", id);
    if (error) throw new Error(`Failed to update ${table} entry: ${error.message}`);
    return;
  }

  const { data: row, error: fetchError } = await supabase
    .from(table)
    .select("recurring_group_id, expected_date")
    .eq("id", id)
    .single();
  if (fetchError) throw new Error(`Failed to load ${table} entry: ${fetchError.message}`);

  const payload = {
    ...(fields.description !== undefined ? { description: fields.description } : {}),
    ...(fields.amount !== undefined ? { amount: fields.amount } : {}),
    ...(fields.extra ?? {}),
  };

  if (!row.recurring_group_id) {
    const { error } = await supabase.from(table).update(payload).eq("id", id);
    if (error) throw new Error(`Failed to update ${table} entry: ${error.message}`);
    return;
  }

  const { error } = await supabase
    .from(table)
    .update(payload)
    .eq("recurring_group_id", row.recurring_group_id)
    .eq("status", "forecast")
    .gte("expected_date", row.expected_date);
  if (error) throw new Error(`Failed to update ${table} series: ${error.message}`);
}
