import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetchAll";

export type DangerLevel = "ok" | "tax_buffer" | "warning" | "bankruptcy";

export type ProjectionPoint = {
  date: string;
  balance: number;
  inflow: number;
  outflow: number;
  level: DangerLevel;
};

export type ProjectionResult = {
  points: ProjectionPoint[];
  thresholds: { taxBuffer: number; warning: number; bankruptcy: number };
  startingBalance: number;
};

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function addDays(date: string, days: number): string {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function levelFor(balance: number, thresholds: ProjectionResult["thresholds"]): DangerLevel {
  if (balance < thresholds.bankruptcy) return "bankruptcy";
  if (balance < thresholds.warning) return "warning";
  if (balance < thresholds.taxBuffer) return "tax_buffer";
  return "ok";
}

async function loadSettings(supabase: ReturnType<typeof createAdminClient>) {
  const { data, error } = await supabase.from("settings").select("key, value");
  if (error) throw new Error(`Failed to load settings: ${error.message}`);
  const map = new Map((data ?? []).map((row) => [row.key, row.value]));
  return {
    startingBalance: map.get("starting_balance") ?? 0,
    taxBuffer: map.get("tax_buffer_threshold") ?? 0,
    warning: map.get("danger_warning_threshold") ?? 0,
    bankruptcy: map.get("danger_bankruptcy_threshold") ?? 0,
  };
}

export async function computeProjection(
  asOfDate: string,
  horizonDays: number,
  granularity: "day" | "week",
): Promise<ProjectionResult> {
  const supabase = createAdminClient();
  const settings = await loadSettings(supabase);
  const endDate = addDays(asOfDate, horizonDays);

  const flowByDate = new Map<string, { inflow: number; outflow: number }>();
  function addFlow(date: string, amount: number) {
    if (date < asOfDate || date > endDate) return;
    const existing = flowByDate.get(date) ?? { inflow: 0, outflow: 0 };
    if (amount >= 0) existing.inflow += amount;
    else existing.outflow += -amount;
    flowByDate.set(date, existing);
  }

  const cashEvents = await fetchAllRows<{ event_date: string; amount: number }>((from, to) =>
    supabase
      .from("cash_events")
      .select("event_date, amount")
      .gte("event_date", asOfDate)
      .lte("event_date", endDate)
      .range(from, to),
  );
  for (const e of cashEvents) addFlow(e.event_date, e.amount);

  const supplierInvoices = await fetchAllRows<{ total: number; due_date: string; paid_date: string | null }>(
    (from, to) => supabase.from("supplier_invoices").select("total, due_date, paid_date").range(from, to),
  );
  for (const inv of supplierInvoices) {
    const date = inv.paid_date ?? inv.due_date;
    addFlow(date, -inv.total);
  }

  const salesForecast = await fetchAllRows<{ amount: number; probability: number; expected_date: string }>(
    (from, to) =>
      supabase
        .from("sales_forecast")
        .select("amount, probability, expected_date")
        .eq("status", "forecast")
        .range(from, to),
  );
  for (const f of salesForecast) addFlow(f.expected_date, f.amount * f.probability);

  const purchaseForecast = await fetchAllRows<{ amount: number; expected_date: string }>((from, to) =>
    supabase.from("purchase_forecast").select("amount, expected_date").eq("status", "forecast").range(from, to),
  );
  for (const f of purchaseForecast) addFlow(f.expected_date, -f.amount);

  const step = granularity === "day" ? 1 : 7;
  const points: ProjectionPoint[] = [];
  let balance = settings.startingBalance;
  let cursor = asOfDate;

  while (cursor <= endDate) {
    const bucketEnd = addDays(cursor, step - 1);
    let inflow = 0;
    let outflow = 0;
    let d = cursor;
    while (d <= bucketEnd && d <= endDate) {
      const flow = flowByDate.get(d);
      if (flow) {
        inflow += flow.inflow;
        outflow += flow.outflow;
      }
      d = addDays(d, 1);
    }
    balance += inflow - outflow;
    points.push({ date: cursor, balance, inflow, outflow, level: levelFor(balance, settings) });
    cursor = addDays(cursor, step);
  }

  return {
    points,
    thresholds: { taxBuffer: settings.taxBuffer, warning: settings.warning, bankruptcy: settings.bankruptcy },
    startingBalance: settings.startingBalance,
  };
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
