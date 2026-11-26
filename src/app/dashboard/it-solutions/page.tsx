"use client";

import { useEffect, useState } from "react";
import { formatSEK } from "@/lib/format";

type MonthRow = {
  month: string;
  costWattWealth: number;
  costAutotme: number;
  cost: number;
  revenueArticle41: number;
  revenueArticle105: number;
  revenueRecurring: number;
  revenue: number;
  net: number;
  recoveredPct: number | null;
};
type CostInvoice = {
  fortnoxDocNumber: string;
  vendor: string;
  supplierName: string | null;
  invoiceDate: string | null;
  total: number | null;
  months: string[];
  note: string | null;
};
type UnassignedInvoice = { fortnoxDocNumber: string; supplierName: string; invoiceDate: string; total: number };
type ItData = { months: MonthRow[]; invoices: CostInvoice[]; unassigned: UnassignedInvoice[] };

function pct(n: number | null) {
  return n == null ? "—" : `${(n * 100).toFixed(1)}%`;
}

function money(n: number) {
  return n === 0 ? "—" : formatSEK(n);
}

function sum(rows: MonthRow[], pick: (r: MonthRow) => number) {
  return rows.reduce((s, r) => s + pick(r), 0);
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border rounded-md px-4 py-3 min-w-[180px]">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-zinc-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function UnassignedRow({ inv, onSaved }: { inv: UnassignedInvoice; onSaved: () => void }) {
  const [vendor, setVendor] = useState(/^autot/i.test(inv.supplierName) ? "Autotme" : "WattWealth");
  const [months, setMonths] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const list = months
      .split(/[,\s]+/)
      .map((m) => m.trim())
      .filter(Boolean);
    const res = await fetch("/api/it-solutions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fortnox_doc_number: inv.fortnoxDocNumber, vendor, months: list, note: note.trim() || null }),
    });
    if (!res.ok) {
      setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Save failed");
      return;
    }
    onSaved();
  }

  return (
    <tr className="border-b">
      <td className="py-2 px-3">{inv.fortnoxDocNumber}</td>
      <td className="py-2 px-3">{inv.supplierName}</td>
      <td className="py-2 px-3">{inv.invoiceDate}</td>
      <td className="py-2 px-3 text-right">{formatSEK(inv.total)}</td>
      <td className="py-2 px-3">
        <select className="border rounded px-1 py-0.5 bg-transparent" value={vendor} onChange={(e) => setVendor(e.target.value)}>
          <option>WattWealth</option>
          <option>Autotme</option>
        </select>
      </td>
      <td className="py-2 px-3">
        <input
          className="border rounded px-2 py-0.5 bg-transparent w-44"
          placeholder="2026-11 or 2026-11,2026-12"
          value={months}
          onChange={(e) => setMonths(e.target.value)}
        />
      </td>
      <td className="py-2 px-3">
        <input className="border rounded px-2 py-0.5 bg-transparent w-56" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      </td>
      <td className="py-2 px-3">
        <button className="border rounded px-2 py-0.5" onClick={save}>
          Save
        </button>
        {error && <span className="text-red-500 text-xs ml-2">{error}</span>}
      </td>
    </tr>
  );
}

export default function ItSolutionsPage() {
  const [data, setData] = useState<ItData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showInvoices, setShowInvoices] = useState(false);

  function load() {
    return fetch("/api/it-solutions")
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? "Failed to load");
        setData(body as ItData);
      })
      .catch((e: Error) => setError(e.message));
  }

  useEffect(() => {
    load();
  }, []);

  if (error) {
    return (
      <p className="text-sm text-red-500">
        Could not load IT solutions data: {error}. If this is the first time, the 0025_it_solutions migration may not have been run yet.
      </p>
    );
  }
  if (!data) return <p>Loading…</p>;

  const rows = data.months;
  const costed = rows.filter((r) => r.cost > 0);
  const last3 = costed.slice(-3);
  const totalCost = sum(rows, (r) => r.cost);
  const totalRevenue = sum(rows, (r) => r.revenue);
  const last3Cost = sum(last3, (r) => r.cost);
  const last3Revenue = sum(last3, (r) => r.revenue);
  const newestFirst = [...rows].reverse();

  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-lg font-semibold mb-1">IT solutions — cost and recovery per month</h2>
        <p className="text-xs text-zinc-500 mb-4 max-w-2xl">
          Cost: WattWealth and Autotme invoices (SEK as booked in Fortnox), an invoice covering several months split evenly.
          Recovered: invoices to customers for article 41 and 105 (ex VAT) plus fixed monthly fees. A month with no cost
          booked yet (typically the current one) shows no recovery %.
        </p>

        <div className="flex flex-wrap gap-3 mb-6">
          <Tile label="Total cost" value={`${formatSEK(totalCost)} SEK`} sub={`${costed[0]?.month ?? ""} – ${costed[costed.length - 1]?.month ?? ""}`} />
          <Tile label="Recovered from customers" value={`${formatSEK(totalRevenue)} SEK`} sub={`${pct(totalCost > 0 ? totalRevenue / totalCost : null)} of cost`} />
          <Tile label="Net (recovered − cost)" value={`${formatSEK(totalRevenue - totalCost)} SEK`} />
          <Tile
            label={`Last ${last3.length} months with cost`}
            value={pct(last3Cost > 0 ? last3Revenue / last3Cost : null)}
            sub={`${formatSEK(last3Revenue)} of ${formatSEK(last3Cost)} SEK`}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="text-sm border-collapse w-full">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 px-3">Month</th>
                <th className="py-2 px-3 text-right">WattWealth</th>
                <th className="py-2 px-3 text-right">Autotme</th>
                <th className="py-2 px-3 text-right border-l">Total cost</th>
                <th className="py-2 px-3 text-right border-l">Article 41</th>
                <th className="py-2 px-3 text-right">Article 105</th>
                <th className="py-2 px-3 text-right">Fixed fees</th>
                <th className="py-2 px-3 text-right border-l">Recovered</th>
                <th className="py-2 px-3 text-right">Net</th>
                <th className="py-2 px-3 text-right">Recovered %</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b font-semibold">
                <td className="py-2 px-3">Total</td>
                <td className="py-2 px-3 text-right">{money(sum(rows, (r) => r.costWattWealth))}</td>
                <td className="py-2 px-3 text-right">{money(sum(rows, (r) => r.costAutotme))}</td>
                <td className="py-2 px-3 text-right border-l">{money(totalCost)}</td>
                <td className="py-2 px-3 text-right border-l">{money(sum(rows, (r) => r.revenueArticle41))}</td>
                <td className="py-2 px-3 text-right">{money(sum(rows, (r) => r.revenueArticle105))}</td>
                <td className="py-2 px-3 text-right">{money(sum(rows, (r) => r.revenueRecurring))}</td>
                <td className="py-2 px-3 text-right border-l">{money(totalRevenue)}</td>
                <td className="py-2 px-3 text-right">{formatSEK(totalRevenue - totalCost)}</td>
                <td className="py-2 px-3 text-right">{pct(totalCost > 0 ? totalRevenue / totalCost : null)}</td>
              </tr>
              {newestFirst.map((r) => (
                <tr key={r.month} className="border-b">
                  <td className="py-2 px-3">{r.month}</td>
                  <td className="py-2 px-3 text-right">{money(r.costWattWealth)}</td>
                  <td className="py-2 px-3 text-right">{money(r.costAutotme)}</td>
                  <td className="py-2 px-3 text-right border-l">{money(r.cost)}</td>
                  <td className="py-2 px-3 text-right border-l">{money(r.revenueArticle41)}</td>
                  <td className="py-2 px-3 text-right">{money(r.revenueArticle105)}</td>
                  <td className="py-2 px-3 text-right">{money(r.revenueRecurring)}</td>
                  <td className="py-2 px-3 text-right border-l">{money(r.revenue)}</td>
                  <td className="py-2 px-3 text-right">{r.cost > 0 || r.revenue > 0 ? formatSEK(r.net) : "—"}</td>
                  <td className="py-2 px-3 text-right">{pct(r.recoveredPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {data.unassigned.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-1">Unassigned invoices from WattWealth / Autotme</h2>
          <p className="text-xs text-zinc-500 mb-3 max-w-2xl">
            These aren&apos;t counted as IT cost yet. Enter which month(s) each one pays for — several months are
            separated by commas and the amount is split evenly.
          </p>
          <div className="overflow-x-auto">
            <table className="text-sm border-collapse">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 px-3">Invoice</th>
                  <th className="py-2 px-3">Supplier</th>
                  <th className="py-2 px-3">Date</th>
                  <th className="py-2 px-3 text-right">Amount (SEK)</th>
                  <th className="py-2 px-3">Vendor</th>
                  <th className="py-2 px-3">Cost month(s)</th>
                  <th className="py-2 px-3">Note</th>
                  <th className="py-2 px-3" />
                </tr>
              </thead>
              <tbody>
                {data.unassigned.map((inv) => (
                  <UnassignedRow key={inv.fortnoxDocNumber} inv={inv} onSaved={load} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <button className="text-sm underline mb-3" onClick={() => setShowInvoices((v) => !v)}>
          {showInvoices ? "Hide" : "Show"} cost invoices ({data.invoices.length})
        </button>
        {showInvoices && (
          <div className="overflow-x-auto">
            <table className="text-sm border-collapse">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 px-3">Invoice</th>
                  <th className="py-2 px-3">Vendor</th>
                  <th className="py-2 px-3">Invoice date</th>
                  <th className="py-2 px-3 text-right">Amount (SEK)</th>
                  <th className="py-2 px-3">Cost month(s)</th>
                  <th className="py-2 px-3">Note</th>
                </tr>
              </thead>
              <tbody>
                {data.invoices.map((inv) => (
                  <tr key={inv.fortnoxDocNumber} className="border-b">
                    <td className="py-2 px-3">{inv.fortnoxDocNumber}</td>
                    <td className="py-2 px-3">{inv.vendor}</td>
                    <td className="py-2 px-3">{inv.invoiceDate ?? "—"}</td>
                    <td className="py-2 px-3 text-right">
                      {inv.total != null ? formatSEK(inv.total) : <span className="text-red-500">not found in Fortnox data</span>}
                    </td>
                    <td className="py-2 px-3">{inv.months.join(", ")}</td>
                    <td className="py-2 px-3 text-zinc-500">{inv.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
