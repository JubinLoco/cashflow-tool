import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import { splitByBusinessLine, type BusinessLine } from "@/lib/sales/businessLine";

export type WeeklyPoint = {
  week: string;
  forecast: number;
  forecastProfit: number;
  real: number;
  grossProfit: number;
  marginPct: number;
};
export type WeeklyByLine = { businessLine: BusinessLine; weeks: WeeklyPoint[] };

const BUSINESS_LINES: BusinessLine[] = ["residential", "gmax_ci", "consultancy"];

// ISO 8601 week: the week containing the year's first Thursday is week 1.
function weekKey(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00Z");
  const day = (date.getUTCDay() + 6) % 7; // 0 = Monday
  date.setUTCDate(date.getUTCDate() - day + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  const weekNum = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function mondayOf(date: Date): Date {
  const d = new Date(date);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d;
}

export async function computeWeeklyByLine(weeksBack: number, weeksForward: number): Promise<WeeklyByLine[]> {
  const supabase = createAdminClient();
  const today = new Date();
  const startDate = new Date(today);
  startDate.setUTCDate(startDate.getUTCDate() - weeksBack * 7);
  const endDate = new Date(today);
  endDate.setUTCDate(endDate.getUTCDate() + weeksForward * 7);
  const startStr = startDate.toISOString().slice(0, 10);
  const endStr = endDate.toISOString().slice(0, 10);

  const [salesForecast, invoices, overrides, marginSetting] = await Promise.all([
    // Unlike the cashflow projection (which must drop a row the moment it's matched, to
    // avoid double-counting it alongside the real invoice), this view is a trend/accuracy
    // comparison — a matched row is a forecast that came true, still worth showing against
    // Real for that week. Only "dropped" (flagged wrong/duplicate) is excluded.
    fetchAllRows<{
      amount: number;
      probability: number;
      expected_date: string;
      product_line: BusinessLine | null;
      expected_margin_pct: number | null;
    }>((from, to) =>
      supabase
        .from("sales_forecast")
        .select("amount, probability, expected_date, product_line, expected_margin_pct")
        .neq("status", "dropped")
        .gte("expected_date", startStr)
        .lt("expected_date", endStr)
        .range(from, to),
    ),
    fetchAllRows<{
      fortnox_doc_number: string;
      total: number;
      net_total: number | null;
      gross_profit: number | null;
      consultancy_total: number | null;
      consultancy_net_total: number | null;
      consultancy_gross_profit: number | null;
      invoice_date: string;
    }>((from, to) =>
      supabase
        .from("customer_invoices")
        .select(
          "fortnox_doc_number, total, net_total, gross_profit, consultancy_total, consultancy_net_total, consultancy_gross_profit, invoice_date",
        )
        .gte("invoice_date", startStr)
        .lt("invoice_date", endStr)
        .range(from, to),
    ),
    fetchAllRows<{ fortnox_doc_number: string; business_line: BusinessLine }>((from, to) =>
      supabase.from("sales_business_line_overrides").select("fortnox_doc_number, business_line").range(from, to),
    ),
    supabase.from("settings").select("value").eq("key", "gross_margin_pct").maybeSingle(),
  ]);

  const overrideByDoc = new Map(overrides.map((o) => [o.fortnox_doc_number, o.business_line]));
  const defaultMarginPct = Number(marginSetting.data?.value ?? 0.15);

  const weeks: string[] = [];
  const cursor = mondayOf(startDate);
  const lastMonday = mondayOf(endDate);
  while (cursor <= lastMonday) {
    weeks.push(weekKey(cursor.toISOString().slice(0, 10)));
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }

  const byLine = new Map<
    BusinessLine,
    Map<string, { forecast: number; forecastProfit: number; real: number; netReal: number; grossProfit: number }>
  >();
  for (const line of BUSINESS_LINES) {
    byLine.set(line, new Map(weeks.map((w) => [w, { forecast: 0, forecastProfit: 0, real: 0, netReal: 0, grossProfit: 0 }])));
  }

  for (const row of salesForecast) {
    const line = row.product_line && BUSINESS_LINES.includes(row.product_line) ? row.product_line : "residential";
    const bucket = byLine.get(line)!.get(weekKey(row.expected_date));
    if (bucket) {
      const expected = row.amount * row.probability;
      bucket.forecast += expected;
      // A deal-specific margin overrides the global default (see ForecastSection's
      // optional "Expected margin %" field) — most forecast rows don't set one.
      bucket.forecastProfit += expected * (row.expected_margin_pct ?? defaultMarginPct);
    }
  }

  for (const inv of invoices) {
    // An invoice can mix a consultancy line item with unrelated residential/C&I rows —
    // split rather than moving the whole invoice to one line (see businessLine.ts).
    const portions = splitByBusinessLine(
      {
        total: inv.total,
        net_total: inv.net_total ?? inv.total,
        gross_profit: inv.gross_profit ?? 0,
        consultancy_total: inv.consultancy_total ?? 0,
        consultancy_net_total: inv.consultancy_net_total ?? 0,
        consultancy_gross_profit: inv.consultancy_gross_profit ?? 0,
      },
      overrideByDoc.get(inv.fortnox_doc_number),
    );
    const week = weekKey(inv.invoice_date);
    for (const portion of portions) {
      const bucket = byLine.get(portion.businessLine)!.get(week);
      if (bucket) {
        bucket.real += portion.total;
        // Margin % must divide by the ex-VAT amount — ContributionValue (gross profit) is
        // computed by Fortnox on an ex-VAT basis, so dividing by VAT-inclusive Total would
        // understate margin by roughly the VAT rate.
        bucket.netReal += portion.netTotal;
        bucket.grossProfit += portion.grossProfit;
      }
    }
  }

  return BUSINESS_LINES.map((businessLine) => ({
    businessLine,
    weeks: weeks.map((week) => {
      const point = byLine.get(businessLine)!.get(week)!;
      return {
        week,
        forecast: point.forecast,
        forecastProfit: point.forecastProfit,
        real: point.real,
        grossProfit: point.grossProfit,
        marginPct: point.netReal === 0 ? 0 : point.grossProfit / point.netReal,
      };
    }),
  }));
}
