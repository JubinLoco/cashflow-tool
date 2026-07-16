"use client";

import { useEffect, useState } from "react";
import BalanceChart from "./BalanceChart";
import ComparisonChart from "./ComparisonChart";
import WeeklyByLineTable from "./WeeklyByLineTable";
import MonthlyPnlTable from "./MonthlyPnlTable";
import { formatSEK } from "@/lib/format";

type LineItem = { amount: number; description: string };
type ProjectionPoint = {
  date: string;
  balance: number;
  inflow: number;
  outflow: number;
  inflowItems: LineItem[];
  outflowItems: LineItem[];
  level: string;
};
type Projection = {
  points: ProjectionPoint[];
  thresholds: { taxBuffer: number; warning: number; bankruptcy: number };
  startingBalance: number;
};
type MonthlyComparison = { month: string; forecast: number; actual: number };
type WeeklyPoint = { week: string; forecast: number; forecastProfit: number; real: number; grossProfit: number; marginPct: number };
type WeeklyByLineData = { businessLine: string; weeks: WeeklyPoint[] };
type PnlFigures = { turnover: number; cogs: number; grossProfit: number; opex: number; companyProfit: number };
type MonthlyPnlRow = { month: string; real: PnlFigures; budget: PnlFigures; equity: number };

const LEVEL_LABEL: Record<string, string> = {
  ok: "Healthy",
  tax_buffer: "Below tax buffer",
  warning: "Warning",
  bankruptcy: "Bankruptcy risk",
};

export default function DashboardPage() {
  const [granularity, setGranularity] = useState<"day" | "week">("day");
  const [projection, setProjection] = useState<Projection | null>(null);
  const [sales, setSales] = useState<MonthlyComparison[]>([]);
  const [purchases, setPurchases] = useState<MonthlyComparison[]>([]);
  const [weeklyByLine, setWeeklyByLine] = useState<WeeklyByLineData[]>([]);
  const [monthlyPnl, setMonthlyPnl] = useState<MonthlyPnlRow[]>([]);

  useEffect(() => {
    fetch(`/api/dashboard/projection?granularity=${granularity}`)
      .then((r) => r.json())
      .then(setProjection);
  }, [granularity]);

  useEffect(() => {
    fetch("/api/dashboard/forecast-vs-actual")
      .then((r) => r.json())
      .then((d) => {
        setSales(d.sales);
        setPurchases(d.purchases);
      });
  }, []);

  useEffect(() => {
    fetch("/api/dashboard/weekly-by-line")
      .then((r) => r.json())
      .then(setWeeklyByLine);
  }, []);

  useEffect(() => {
    fetch("/api/dashboard/monthly-pnl")
      .then((r) => r.json())
      .then(setMonthlyPnl);
  }, []);

  const firstDanger = projection?.points.find((p) => p.level !== "ok");

  return (
    <main className="p-10 font-sans max-w-[1800px] w-full mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Dashboard</h1>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatTile label="Starting balance" value={projection ? `${formatSEK(projection.startingBalance)} SEK` : "…"} />
        <StatTile
          label="Projected balance (end of horizon)"
          value={projection ? `${formatSEK(projection.points.at(-1)?.balance ?? 0)} SEK` : "…"}
        />
        <StatTile
          label="First danger date"
          value={firstDanger ? `${firstDanger.date} (${LEVEL_LABEL[firstDanger.level]})` : projection ? "None in horizon" : "…"}
        />
      </div>

      <section className="mb-10">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-semibold">Cash balance projection</h2>
          <div className="flex gap-1 text-sm">
            <button
              className={`px-2 py-1 rounded ${granularity === "day" ? "bg-foreground text-background" : "underline"}`}
              onClick={() => setGranularity("day")}
            >
              90 days
            </button>
            <button
              className={`px-2 py-1 rounded ${granularity === "week" ? "bg-foreground text-background" : "underline"}`}
              onClick={() => setGranularity("week")}
            >
              12 months
            </button>
          </div>
        </div>
        {projection ? <BalanceChart points={projection.points} thresholds={projection.thresholds} /> : <p>Loading…</p>}
      </section>

      <section className="grid md:grid-cols-2 gap-8 mb-10">
        <ComparisonChart title="Sales: forecast vs. actual" data={sales} />
        <ComparisonChart title="Purchases: forecast vs. actual" data={purchases} />
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-3">Weekly by business line</h2>
        {weeklyByLine.length > 0 ? <WeeklyByLineTable data={weeklyByLine} /> : <p>Loading…</p>}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Monthly P&amp;L and equity</h2>
        {monthlyPnl.length > 0 ? <MonthlyPnlTable data={monthlyPnl} /> : <p>Loading…</p>}
      </section>
    </main>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="border rounded p-4">
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
