"use client";

import { Fragment, useEffect, useState } from "react";

type BatteryModel = {
  article_number: string;
  article_description: string | null;
  weight_kg: number | null;
};

type MonthlyModelBreakdown = {
  articleNumber: string;
  articleDescription: string | null;
  quantity: number;
  weightKg: number | null;
  weightContributionKg: number;
};

type MonthlyBatteryWeight = {
  month: string;
  totalWeightKg: number;
  byModel: MonthlyModelBreakdown[];
};

function formatKg(n: number) {
  return `${n.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} kg`;
}

export default function BatteryRecyclingPage() {
  const [models, setModels] = useState<BatteryModel[]>([]);
  const [monthly, setMonthly] = useState<MonthlyBatteryWeight[]>([]);
  const [loading, setLoading] = useState(true);
  const [weightDrafts, setWeightDrafts] = useState<Record<string, string>>({});
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  function refetch() {
    return Promise.all([
      fetch("/api/battery/models").then((r) => r.json()) as Promise<BatteryModel[]>,
      fetch("/api/battery/monthly").then((r) => r.json()) as Promise<MonthlyBatteryWeight[]>,
    ]).then(([modelsData, monthlyData]) => {
      setModels(modelsData);
      setMonthly(monthlyData);
      setWeightDrafts(Object.fromEntries(modelsData.map((m) => [m.article_number, m.weight_kg?.toString() ?? ""])));
    });
  }

  useEffect(() => {
    refetch().then(() => setLoading(false));
  }, []);

  async function saveWeight(articleNumber: string) {
    const raw = weightDrafts[articleNumber];
    const weight_kg = raw.trim() === "" ? null : Number(raw);
    if (weight_kg != null && Number.isNaN(weight_kg)) return;

    await fetch("/api/battery/models", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ article_number: articleNumber, weight_kg }),
    });
    refetch();
  }

  async function removeModel(articleNumber: string) {
    setModels((prev) => prev.filter((m) => m.article_number !== articleNumber));
    await fetch(`/api/battery/models/${encodeURIComponent(articleNumber)}`, { method: "DELETE" });
    refetch();
  }

  if (loading) {
    return <p>Loading…</p>;
  }

  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-lg font-semibold mb-1">Battery models</h2>
        <p className="text-xs text-zinc-500 mb-3 max-w-xl">
          Detected automatically from Fortnox invoice line items whose article name/description matches
          &quot;batteri&quot;/&quot;battery&quot; — this can catch things that aren&apos;t really batteries (e.g. a
          charger), so double-check the article description before trusting a row. Set each model&apos;s unit weight
          (kg) below; remove a row if it&apos;s a false positive.
        </p>
        {models.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No battery articles detected yet — run a sync (Dashboard → Cashflow → Sync now) first.
          </p>
        ) : (
          <div className="max-h-96 overflow-y-auto text-sm">
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-left border-b sticky top-0 bg-background">
                  <th className="py-1">Article #</th>
                  <th className="py-1">Description</th>
                  <th className="py-1">Weight (kg)</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody>
                {models.map((m) => (
                  <tr key={m.article_number} className="border-b">
                    <td className="py-1 pr-2">{m.article_number}</td>
                    <td className="py-1 pr-2">{m.article_description ?? "—"}</td>
                    <td className="py-1 pr-2">
                      <input
                        type="number"
                        step="0.01"
                        className="border rounded px-2 py-1 w-24"
                        value={weightDrafts[m.article_number] ?? ""}
                        onChange={(e) =>
                          setWeightDrafts((d) => ({ ...d, [m.article_number]: e.target.value }))
                        }
                        onBlur={() => saveWeight(m.article_number)}
                        placeholder="not set"
                      />
                    </td>
                    <td className="py-1">
                      <button
                        onClick={() => removeModel(m.article_number)}
                        className="text-xs text-zinc-500 hover:text-red-600"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold">Monthly weight totals</h2>
          {monthly.length > 0 && (
            <a
              href="/api/battery/monthly/export"
              className="text-xs px-3 py-1.5 rounded bg-foreground text-background"
            >
              Download Excel
            </a>
          )}
        </div>
        <p className="text-xs text-zinc-500 mb-3 max-w-xl">
          Total battery weight sold per month (quantity × unit weight), for El-Kretsen reporting. Click a month to
          see the per-model breakdown. A model with no weight set yet contributes 0 kg here — set its weight above
          to include it. The download includes every month, with a second sheet breaking each one down by model.
        </p>
        {monthly.length === 0 ? (
          <p className="text-sm text-zinc-500">No battery sales recorded yet.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-1">Month</th>
                <th className="py-1">Total weight</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {monthly.map((m) => (
                <Fragment key={m.month}>
                  <tr className="border-b">
                    <td className="py-1">{m.month}</td>
                    <td className="py-1">{formatKg(m.totalWeightKg)}</td>
                    <td className="py-1">
                      <button
                        onClick={() => setExpandedMonth((cur) => (cur === m.month ? null : m.month))}
                        className="text-xs text-zinc-500 underline"
                      >
                        {expandedMonth === m.month ? "Hide" : "Details"}
                      </button>
                    </td>
                  </tr>
                  {expandedMonth === m.month && (
                    <tr className="border-b bg-zinc-50">
                      <td colSpan={3} className="py-2">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-zinc-500">
                              <th className="py-0.5 pl-4">Model</th>
                              <th className="py-0.5">Qty</th>
                              <th className="py-0.5">Unit weight</th>
                              <th className="py-0.5">Contribution</th>
                            </tr>
                          </thead>
                          <tbody>
                            {m.byModel.map((row) => (
                              <tr key={row.articleNumber}>
                                <td className="py-0.5 pl-4">{row.articleDescription ?? row.articleNumber}</td>
                                <td className="py-0.5">{row.quantity}</td>
                                <td className="py-0.5">{row.weightKg != null ? formatKg(row.weightKg) : "not set"}</td>
                                <td className="py-0.5">{formatKg(row.weightContributionKg)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
