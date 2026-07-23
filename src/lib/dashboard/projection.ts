import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import { loadDerivationSettings, deriveTaxFlows, deriveMaterialCostFlows } from "@/lib/dashboard/derivedForecast";

export type DangerLevel = "ok" | "tax_buffer" | "warning" | "bankruptcy";

export type LineItem = { amount: number; description: string };

export type ProjectionPoint = {
  date: string;
  balance: number;
  inflow: number;
  outflow: number;
  inflowItems: LineItem[];
  outflowItems: LineItem[];
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

async function loadFactoringSplit(supabase: ReturnType<typeof createAdminClient>) {
  const { data: rules, error: rulesError } = await supabase
    .from("factoring_rules")
    .select("tranche_a_pct, tranche_a_days_after_invoice, tranche_b_pct")
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (rulesError) throw new Error(`Failed to load factoring rules: ${rulesError.message}`);

  const { data: delayStats } = await supabase
    .from("payment_delay_stats")
    .select("avg_days_due_to_paid")
    .order("computed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    trancheAPct: rules?.tranche_a_pct ?? 0.7,
    trancheADays: rules?.tranche_a_days_after_invoice ?? 1,
    trancheBPct: rules?.tranche_b_pct ?? 0.3,
    avgDaysDueToPaid: delayStats?.avg_days_due_to_paid ?? 0,
  };
}

const TRANCHE_LABEL: Record<string, string> = { a: "70% D+1", b: "30% on payment", c: "excluded, paid direct" };

export async function computeProjection(
  asOfDate: string,
  horizonDays: number,
  granularity: "day" | "week",
): Promise<ProjectionResult> {
  const supabase = createAdminClient();
  const settings = await loadSettings(supabase);
  const split = await loadFactoringSplit(supabase);
  const endDate = addDays(asOfDate, horizonDays);

  const flowByDate = new Map<
    string,
    { inflow: number; outflow: number; inflowItems: LineItem[]; outflowItems: LineItem[] }
  >();
  function addFlow(date: string, amount: number, description: string) {
    if (date < asOfDate || date > endDate) return;
    const existing = flowByDate.get(date) ?? { inflow: 0, outflow: 0, inflowItems: [], outflowItems: [] };
    if (amount >= 0) {
      existing.inflow += amount;
      existing.inflowItems.push({ amount, description });
    } else {
      existing.outflow += -amount;
      existing.outflowItems.push({ amount: -amount, description });
    }
    flowByDate.set(date, existing);
  }

  const customerInvoices = await fetchAllRows<{ id: string; customer_name: string }>((from, to) =>
    supabase.from("customer_invoices").select("id, customer_name").range(from, to),
  );
  const customerNameById = new Map(customerInvoices.map((c) => [c.id, c.customer_name]));

  const cashEvents = await fetchAllRows<{
    event_date: string;
    amount: number;
    tranche: string;
    source_invoice_id: string;
    is_estimated: boolean;
  }>((from, to) =>
    supabase
      .from("cash_events")
      .select("event_date, amount, tranche, source_invoice_id, is_estimated")
      .gte("event_date", asOfDate)
      .lte("event_date", endDate)
      .range(from, to),
  );
  for (const e of cashEvents) {
    const name = customerNameById.get(e.source_invoice_id) ?? "Unknown customer";
    const suffix = e.is_estimated ? " (est.)" : "";
    addFlow(e.event_date, e.amount, `${name} — ${TRANCHE_LABEL[e.tranche] ?? e.tranche}${suffix}`);
  }

  const supplierInvoices = await fetchAllRows<{
    total: number;
    due_date: string;
    paid_date: string | null;
    manual_paid: boolean | null;
    supplier_name: string;
  }>((from, to) =>
    supabase.from("supplier_invoices").select("total, due_date, paid_date, manual_paid, supplier_name").range(from, to),
  );
  for (const inv of supplierInvoices) {
    // manual_paid overrides the Fortnox-synced balance/paid_date when set, for when the
    // sync hasn't caught up yet — same reasoning as the Verify page's "Mark paid" toggle.
    // Already paid means it shouldn't show as a pending outflow at all.
    if (inv.manual_paid) continue;
    const date = inv.paid_date ?? inv.due_date;
    addFlow(date, -inv.total, inv.supplier_name);
  }

  const salesForecast = await fetchAllRows<{
    amount: number;
    probability: number;
    expected_date: string;
    description: string;
  }>((from, to) =>
    supabase
      .from("sales_forecast")
      .select("amount, probability, expected_date, description")
      .eq("status", "forecast")
      .range(from, to),
  );
  for (const f of salesForecast) {
    const expected = f.amount * f.probability;
    // Mirrors real invoice cash timing: a forecast entry represents the full order
    // value (imported from the "invoice raised" 70% tranche), not cash landing all at
    // once. 70% lands like a real tranche A, the other 30% only later like tranche B —
    // crediting the full amount immediately was overstating near-term projected cash.
    addFlow(
      addDays(f.expected_date, Math.round(split.trancheADays)),
      expected * split.trancheAPct,
      `${f.description} — forecast 70%`,
    );
    addFlow(
      addDays(f.expected_date, Math.round(split.avgDaysDueToPaid)),
      expected * split.trancheBPct,
      `${f.description} — forecast 30%`,
    );
  }

  // Tax and material cost aren't separately entered — they're derived live from unmatched
  // sales forecast entries, so changing a sales number automatically changes what it implies
  // for tax and supplier cost without needing a manually-entered purchase forecast row kept
  // in sync by hand.
  const derivationSettings = await loadDerivationSettings(supabase);
  for (const flow of deriveTaxFlows(salesForecast, derivationSettings)) {
    addFlow(flow.date, flow.amount, flow.description);
  }
  for (const flow of deriveMaterialCostFlows(salesForecast, derivationSettings)) {
    addFlow(flow.date, flow.amount, flow.description);
  }

  const purchaseForecast = await fetchAllRows<{ amount: number; expected_date: string; description: string }>(
    (from, to) =>
      supabase
        .from("purchase_forecast")
        .select("amount, expected_date, description")
        .eq("status", "forecast")
        .range(from, to),
  );
  for (const f of purchaseForecast) addFlow(f.expected_date, -f.amount, `${f.description} — forecast`);

  const step = granularity === "day" ? 1 : 7;
  const points: ProjectionPoint[] = [];
  let balance = settings.startingBalance;
  let cursor = asOfDate;

  while (cursor <= endDate) {
    const bucketEnd = addDays(cursor, step - 1);
    let inflow = 0;
    let outflow = 0;
    const inflowItems: LineItem[] = [];
    const outflowItems: LineItem[] = [];
    let d = cursor;
    while (d <= bucketEnd && d <= endDate) {
      const flow = flowByDate.get(d);
      if (flow) {
        inflow += flow.inflow;
        outflow += flow.outflow;
        inflowItems.push(...flow.inflowItems);
        outflowItems.push(...flow.outflowItems);
      }
      d = addDays(d, 1);
    }
    balance += inflow - outflow;
    points.push({ date: cursor, balance, inflow, outflow, inflowItems, outflowItems, level: levelFor(balance, settings) });
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
