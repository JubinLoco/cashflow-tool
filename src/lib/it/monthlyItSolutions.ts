import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import { IT_ARTICLE_STREAM, IT_RECURRING_STREAM, IT_REVENUE_STREAMS, IT_ROLES, type ItTeam } from "@/lib/it/config";

export type ItMonthRow = {
  month: string; // "YYYY-MM"
  costWattWealth: number;
  costAutotme: number;
  cost: number;
  costByRole: Record<string, number>; // keyed by IT_ROLES key (+ "unallocated" when an invoice has no team)
  revenueByStream: Record<string, number>; // keyed by IT_REVENUE_STREAMS key
  revenue: number;
  net: number; // revenue - cost
  recoveredPct: number | null; // revenue / cost, null when the month has no cost booked yet
};

export type ItCostInvoice = {
  fortnoxDocNumber: string;
  vendor: string;
  supplierName: string | null;
  invoiceDate: string | null;
  total: number | null; // SEK, as booked in Fortnox
  months: string[];
  note: string | null;
  team: ItTeam | null; // headcount per role behind this invoice
};

export type ItUnassignedInvoice = {
  fortnoxDocNumber: string;
  supplierName: string;
  invoiceDate: string;
  total: number;
};

export type ItSolutionsData = {
  streams: { key: string; label: string }[];
  roles: { key: string; label: string }[];
  months: ItMonthRow[];
  invoices: ItCostInvoice[];
  unassigned: ItUnassignedInvoice[];
};

type CostRow = { fortnox_doc_number: string; vendor: string; months: string[]; note: string | null; team?: ItTeam | null };
type SupplierRow = { fortnox_doc_number: string; supplier_name: string | null; invoice_date: string | null; total: number | null };
type RevenueRow = { article_number: string; invoice_date: string; net_amount: number };
type RecurringRow = { monthly_amount: number; start_month: string; end_month: string | null };

function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

/**
 * Cost: each mapped supplier invoice's SEK total (as booked in Fortnox, converted at the
 * invoice-date rate) split evenly over the months it covers. Revenue: net (ex VAT) invoice
 * lines for the IT articles by invoice month, plus fixed recurring fees. One source of truth,
 * joined here at read time rather than stored as a rollup.
 */
export async function computeItSolutions(): Promise<ItSolutionsData> {
  const supabase = createAdminClient();

  // `team` was added by migration 0026 -- fall back to selecting without it so the tab keeps
  // working (cost per month, no role split) until that migration has been run.
  const loadCostRows = () =>
    fetchAllRows<CostRow>((from, to) =>
      supabase.from("it_cost_invoices").select("fortnox_doc_number, vendor, months, note, team").range(from, to),
    ).catch(() =>
      fetchAllRows<CostRow>((from, to) =>
        supabase.from("it_cost_invoices").select("fortnox_doc_number, vendor, months, note").range(from, to),
      ),
    );

  const [costRows, revenueRows, recurringRows] = await Promise.all([
    loadCostRows(),
    fetchAllRows<RevenueRow>((from, to) =>
      supabase.from("it_revenue_lines").select("article_number, invoice_date, net_amount").range(from, to),
    ),
    fetchAllRows<RecurringRow>((from, to) =>
      supabase.from("it_recurring_revenue").select("monthly_amount, start_month, end_month").range(from, to),
    ),
  ]);

  // Candidate IT-vendor invoices, to spot ones not yet mapped to a cost month. The name match
  // is deliberately loose -- "WattWelath" (sic) is how two real invoices are registered.
  const supplierRows = await fetchAllRows<SupplierRow>((from, to) =>
    supabase
      .from("supplier_invoices")
      .select("fortnox_doc_number, supplier_name, invoice_date, total")
      .or("supplier_name.ilike.wattwe%,supplier_name.ilike.autot%")
      .range(from, to),
  );
  const supplierByDoc = new Map(supplierRows.map((s) => [s.fortnox_doc_number, s]));

  // Mapped invoices may not match the name filter above (a renamed supplier), so fetch any
  // missing ones directly.
  const missingDocs = costRows.map((c) => c.fortnox_doc_number).filter((d) => !supplierByDoc.has(d));
  if (missingDocs.length > 0) {
    const { data } = await supabase
      .from("supplier_invoices")
      .select("fortnox_doc_number, supplier_name, invoice_date, total")
      .in("fortnox_doc_number", missingDocs);
    for (const s of (data ?? []) as SupplierRow[]) supplierByDoc.set(s.fortnox_doc_number, s);
  }

  const costByMonth = new Map<string, { WattWealth: number; Autotme: number }>();
  const roleCostByMonth = new Map<string, Record<string, number>>();
  const invoices: ItCostInvoice[] = [];
  for (const c of costRows) {
    const supplier = supplierByDoc.get(c.fortnox_doc_number);
    const total = supplier?.total != null ? Number(supplier.total) : null;
    invoices.push({
      fortnoxDocNumber: c.fortnox_doc_number,
      vendor: c.vendor,
      supplierName: supplier?.supplier_name ?? null,
      invoiceDate: supplier?.invoice_date ?? null,
      total,
      months: [...c.months].sort(),
      note: c.note,
      team: c.team ?? null,
    });
    if (total == null || c.months.length === 0) continue;
    const share = total / c.months.length;

    // Split the invoice across roles in proportion to headcount x rough rate, so the roles sum
    // to exactly the invoice amount. No usable team -> the whole amount is "unallocated".
    const weights = IT_ROLES.map((r) => ({ key: r.key as string, w: Math.max(0, Number(c.team?.[r.key] ?? 0)) * r.monthlyRate }));
    const weightSum = weights.reduce((a, b) => a + b.w, 0);
    const roleSplit: Record<string, number> =
      weightSum > 0 ? Object.fromEntries(weights.filter((x) => x.w > 0).map((x) => [x.key, (share * x.w) / weightSum])) : { unallocated: share };

    for (const month of c.months) {
      const entry = costByMonth.get(month) ?? { WattWealth: 0, Autotme: 0 };
      if (c.vendor === "Autotme") entry.Autotme += share;
      else entry.WattWealth += share;
      costByMonth.set(month, entry);

      const roleEntry = roleCostByMonth.get(month) ?? {};
      for (const [role, amount] of Object.entries(roleSplit)) roleEntry[role] = (roleEntry[role] ?? 0) + amount;
      roleCostByMonth.set(month, roleEntry);
    }
  }

  const mapped = new Set(costRows.map((c) => c.fortnox_doc_number));
  const unassigned: ItUnassignedInvoice[] = supplierRows
    .filter((s) => !mapped.has(s.fortnox_doc_number) && s.invoice_date && s.total != null)
    .map((s) => ({
      fortnoxDocNumber: s.fortnox_doc_number,
      supplierName: s.supplier_name ?? "",
      invoiceDate: s.invoice_date!,
      total: Number(s.total),
    }))
    .sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate));

  const revenueByMonth = new Map<string, Record<string, number>>();
  for (const r of revenueRows) {
    const stream = IT_ARTICLE_STREAM[r.article_number];
    if (!stream) continue; // article no longer mapped to a stream
    const month = r.invoice_date.slice(0, 7);
    const entry = revenueByMonth.get(month) ?? {};
    entry[stream] = (entry[stream] ?? 0) + Number(r.net_amount);
    revenueByMonth.set(month, entry);
  }

  const currentMonth = new Date().toISOString().slice(0, 7);
  const costMonths = [...costByMonth.keys()].sort();
  const firstMonth = costMonths[0] ?? currentMonth;
  const lastCostMonth = costMonths[costMonths.length - 1] ?? currentMonth;
  const lastMonth = lastCostMonth > currentMonth ? lastCostMonth : currentMonth;

  const months: ItMonthRow[] = monthRange(firstMonth, lastMonth).map((month) => {
    const cost = costByMonth.get(month) ?? { WattWealth: 0, Autotme: 0 };
    const revenueByStream: Record<string, number> = Object.fromEntries(
      IT_REVENUE_STREAMS.map((s) => [s.key, revenueByMonth.get(month)?.[s.key] ?? 0]),
    );
    revenueByStream[IT_RECURRING_STREAM] += recurringRows
      .filter((r) => r.start_month <= month && (r.end_month == null || month <= r.end_month))
      .reduce((sum, r) => sum + Number(r.monthly_amount), 0);
    const totalCost = cost.WattWealth + cost.Autotme;
    const revenue = Object.values(revenueByStream).reduce((a, b) => a + b, 0);
    return {
      month,
      costWattWealth: cost.WattWealth,
      costAutotme: cost.Autotme,
      cost: totalCost,
      costByRole: roleCostByMonth.get(month) ?? {},
      revenueByStream,
      revenue,
      net: revenue - totalCost,
      recoveredPct: totalCost > 0 ? revenue / totalCost : null,
    };
  });

  invoices.sort((a, b) => (a.months[0] ?? "").localeCompare(b.months[0] ?? "") || a.fortnoxDocNumber.localeCompare(b.fortnoxDocNumber));
  const roles: { key: string; label: string }[] = IT_ROLES.map((r) => ({ key: r.key, label: r.label }));
  if (months.some((m) => (m.costByRole.unallocated ?? 0) > 0)) roles.push({ key: "unallocated", label: "Unallocated" });

  return { streams: IT_REVENUE_STREAMS.map((s) => ({ key: s.key, label: s.label })), roles, months, invoices, unassigned };
}
