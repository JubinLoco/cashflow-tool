"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { formatSEK } from "@/lib/format";
import ItChart, { type ChartPeriod, type Series } from "./ItChart";

type Stream = { key: string; label: string };
type Team = Record<string, number>;
type MonthRow = {
  month: string;
  costWattWealth: number;
  costAutotme: number;
  cost: number;
  costByRole: Record<string, number>;
  revenueByStream: Record<string, number>;
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
  team: Team | null;
};
type UnassignedInvoice = { fortnoxDocNumber: string; supplierName: string; invoiceDate: string; total: number };
type ItData = { streams: Stream[]; roles: Stream[]; months: MonthRow[]; invoices: CostInvoice[]; unassigned: UnassignedInvoice[] };

// One table/chart row: a month, or a whole year (sum of its months).
type Row = {
  key: string; // "2026-10" or "2026"
  costWattWealth: number;
  costAutotme: number;
  cost: number;
  costByRole: Record<string, number>;
  byStream: Record<string, number>;
  revenue: number;
};

// Chart/table breakdown choices (cost: none / by vendor / by role; recovered: none / by stream).
type CostSplit = "none" | "vendor" | "roles";
type RevenueSplit = "none" | "streams";

// Colour per entity, fixed across views (validated orders: see ItChart). Cost blue; vendors
// blue + magenta; roles blue, yellow, magenta, green, violet, red in stack order; streams
// orange + aqua; unallocated cost gray.
const VENDORS: Stream[] = [
  { key: "WattWealth", label: "WattWealth" },
  { key: "Autotme", label: "Autotme" },
];
const VENDOR_COLOR: Record<string, string> = { WattWealth: "var(--series-1)", Autotme: "var(--series-5)" };
const ROLE_COLOR: Record<string, string> = {
  head_developer: "var(--series-1)",
  developer: "var(--series-4)",
  design: "var(--series-5)",
  product: "var(--series-6)",
  tester: "var(--series-7)",
  marketing: "var(--series-8)",
  unallocated: "var(--muted)",
};
const STREAM_COLOR = ["var(--series-2)", "var(--series-3)"];

function pct(n: number | null) {
  return n == null ? "—" : `${(n * 100).toFixed(1)}%`;
}
function money(n: number) {
  return n === 0 ? "—" : formatSEK(n);
}
function ratio(r: { cost: number; revenue: number }) {
  return r.cost > 0 ? r.revenue / r.cost : null;
}

function toRow(m: MonthRow): Row {
  return {
    key: m.month,
    costWattWealth: m.costWattWealth,
    costAutotme: m.costAutotme,
    cost: m.cost,
    costByRole: m.costByRole,
    byStream: m.revenueByStream,
    revenue: m.revenue,
  };
}

function sumRows(key: string, rows: Row[], streams: Stream[], roles: Stream[]): Row {
  return {
    key,
    costWattWealth: rows.reduce((s, r) => s + r.costWattWealth, 0),
    costAutotme: rows.reduce((s, r) => s + r.costAutotme, 0),
    cost: rows.reduce((s, r) => s + r.cost, 0),
    costByRole: Object.fromEntries(roles.map((ro) => [ro.key, rows.reduce((s, r) => s + (r.costByRole[ro.key] ?? 0), 0)])),
    byStream: Object.fromEntries(streams.map((st) => [st.key, rows.reduce((s, r) => s + (r.byStream[st.key] ?? 0), 0)])),
    revenue: rows.reduce((s, r) => s + r.revenue, 0),
  };
}

function SegControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-zinc-500">{label}</span>
      <div className="inline-flex border rounded-md overflow-hidden" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            aria-pressed={value === o.value}
            className={`px-3 py-1 ${value === o.value ? "bg-zinc-200 dark:bg-zinc-700 font-medium" : "text-zinc-500"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function teamText(team: Team | null, roles: Stream[]): string {
  if (!team) return "—";
  const parts = roles.filter((r) => (team[r.key] ?? 0) > 0).map((r) => `${team[r.key]} × ${r.label.toLowerCase()}`);
  return parts.length ? parts.join(", ") : "—";
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

function UnassignedRow({
  inv,
  roles,
  defaultTeams,
  onSaved,
}: {
  inv: UnassignedInvoice;
  roles: Stream[];
  defaultTeams: Record<string, Team>;
  onSaved: () => void;
}) {
  const guessedVendor = /^autot/i.test(inv.supplierName) ? "Autotme" : "WattWealth";
  const [vendor, setVendor] = useState(guessedVendor);
  const [months, setMonths] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Starts as the vendor's most recent team -- a new invoice usually has the same people.
  const [team, setTeam] = useState<Record<string, string>>(() =>
    Object.fromEntries(roles.map((r) => [r.key, String(defaultTeams[guessedVendor]?.[r.key] ?? 0)])),
  );

  function changeVendor(v: string) {
    setVendor(v);
    setTeam(Object.fromEntries(roles.map((r) => [r.key, String(defaultTeams[v]?.[r.key] ?? 0)])));
  }

  async function save() {
    setError(null);
    const list = months
      .split(/[,\s]+/)
      .map((m) => m.trim())
      .filter(Boolean);
    const res = await fetch("/api/it-solutions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fortnox_doc_number: inv.fortnoxDocNumber,
        vendor,
        months: list,
        note: note.trim() || null,
        team: Object.fromEntries(roles.map((r) => [r.key, Number(team[r.key]) || 0])),
      }),
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
        <select className="border rounded px-1 py-0.5 bg-transparent" value={vendor} onChange={(e) => changeVendor(e.target.value)}>
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
        <div className="flex gap-2">
          {roles
            .filter((r) => r.key !== "unallocated")
            .map((r) => (
              <label key={r.key} className="flex flex-col text-[10px] text-zinc-500">
                {r.label}
                <input
                  type="number"
                  min={0}
                  step={1}
                  className="border rounded px-1 py-0.5 bg-transparent w-14 text-sm text-foreground"
                  value={team[r.key] ?? "0"}
                  onChange={(e) => setTeam((t) => ({ ...t, [r.key]: e.target.value }))}
                />
              </label>
            ))}
        </div>
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
  const [view, setView] = useState<"months" | "years">("months");
  const [costSplit, setCostSplit] = useState<CostSplit>("none");
  const [revenueSplit, setRevenueSplit] = useState<RevenueSplit>("streams");
  // Years folded in the months view of the table. Empty = every year open.
  const [folded, setFolded] = useState<Set<string>>(new Set());

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

  const currentYear = new Date().getFullYear().toString();

  const derived = useMemo(() => {
    if (!data) return null;
    const streams = data.streams;
    const roles = data.roles;
    const monthRows = data.months.map(toRow); // ascending by month
    const years = [...new Set(monthRows.map((r) => r.key.slice(0, 4)))].sort();
    const yearRows = years.map((y) =>
      sumRows(y, monthRows.filter((r) => r.key.startsWith(y)), streams, roles),
    );
    const total = sumRows("Total", monthRows, streams, roles);
    const costed = monthRows.filter((r) => r.cost > 0);
    const last3 = sumRows("last3", costed.slice(-3), streams, roles);

    // Latest team on file per vendor, used to pre-fill the form for a new unassigned invoice.
    const defaultTeams: Record<string, Team> = {};
    for (const inv of data.invoices) {
      if (inv.team && inv.months.length > 0) defaultTeams[inv.vendor] = inv.team; // invoices arrive oldest-first
    }

    return { streams, roles, monthRows, years, yearRows, total, costed, last3, defaultTeams, last3Count: Math.min(3, costed.length) };
  }, [data]);

  if (error) {
    return (
      <p className="text-sm text-red-500">
        Could not load IT solutions data: {error}. If this is the first time, the 0025_it_solutions migration may not have been run yet.
      </p>
    );
  }
  if (!data || !derived) return <p>Loading…</p>;

  const { streams, roles, monthRows, years, yearRows, total, costed, last3, defaultTeams, last3Count } = derived;
  const teamMissing = data.invoices.length > 0 && data.invoices.every((i) => !i.team);

  // Series and per-period parts for the chosen breakdowns (the same choice drives the table columns).
  const costSeries: Series[] =
    costSplit === "vendor"
      ? VENDORS.map((v) => ({ ...v, color: VENDOR_COLOR[v.key] }))
      : costSplit === "roles"
        ? roles.filter((r) => (total.costByRole[r.key] ?? 0) > 0).map((r) => ({ ...r, color: ROLE_COLOR[r.key] ?? "var(--muted)" }))
        : [{ key: "__cost", label: "Cost", color: "var(--series-1)" }];
  const revenueSeries: Series[] =
    revenueSplit === "streams"
      ? streams.map((s, i) => ({ ...s, color: STREAM_COLOR[i] ?? "var(--muted)" }))
      : [{ key: "__rev", label: "Recovered", color: "var(--series-2)" }];

  const costParts = (r: Row): Record<string, number> =>
    costSplit === "vendor"
      ? { WattWealth: r.costWattWealth, Autotme: r.costAutotme }
      : costSplit === "roles"
        ? r.costByRole
        : { __cost: r.cost };
  const revenueParts = (r: Row): Record<string, number> => (revenueSplit === "streams" ? r.byStream : { __rev: r.revenue });
  const toPeriod = (r: Row, label: string, groupLabel: string | null): ChartPeriod => ({
    key: r.key,
    label,
    groupLabel,
    cost: r.cost,
    costParts: costParts(r),
    revenue: r.revenue,
    revenueParts: revenueParts(r),
    recoveredPct: ratio(r),
  });
  const monthPeriods = monthRows.map((r, i) => toPeriod(r, r.key.slice(5), i === 0 || r.key.endsWith("-01") ? r.key.slice(0, 4) : null));
  const yearPeriods = yearRows.map((r) => toPeriod(r, r.key === currentYear ? `${r.key} (YTD)` : r.key, null));

  // Table columns: the chosen parts, then the total they add up to.
  type Col = { key: string; label: string; get: (r: Row) => number };
  const costCols: Col[] = [
    ...(costSplit === "vendor"
      ? VENDORS.map((v) => ({ key: v.key, label: v.label, get: (r: Row) => (v.key === "Autotme" ? r.costAutotme : r.costWattWealth) }))
      : costSplit === "roles"
        ? roles.map((ro) => ({ key: ro.key, label: ro.label, get: (r: Row) => r.costByRole[ro.key] ?? 0 }))
        : []),
    { key: "__total", label: "Total cost", get: (r: Row) => r.cost },
  ];
  const revenueCols: Col[] = [
    ...(revenueSplit === "streams" ? streams.map((st) => ({ key: st.key, label: st.label, get: (r: Row) => r.byStream[st.key] ?? 0 })) : []),
    { key: "__total", label: "Recovered", get: (r: Row) => r.revenue },
  ];
  const yearLabel = (y: string) => (y === currentYear ? `${y} (YTD)` : y);

  function toggleYear(y: string) {
    setFolded((prev) => {
      const next = new Set(prev);
      if (next.has(y)) next.delete(y);
      else next.add(y);
      return next;
    });
  }

  function dataCells(r: Row) {
    const net = r.revenue - r.cost;
    return (
      <>
        {costCols.map((c) => (
          <td key={c.key} className={`py-2 px-3 text-right ${c.key === "__total" ? "border-l" : ""}`}>
            {money(c.get(r))}
          </td>
        ))}
        {revenueCols.map((c, i) => (
          <td key={c.key} className={`py-2 px-3 text-right ${c.key === "__total" || i === 0 ? "border-l" : ""}`}>
            {money(c.get(r))}
          </td>
        ))}
        <td className="py-2 px-3 text-right border-l">{r.cost > 0 || r.revenue > 0 ? formatSEK(net) : "—"}</td>
        <td className="py-2 px-3 text-right">{pct(ratio(r))}</td>
      </>
    );
  }

  const colCount = 1 + costCols.length + revenueCols.length + 2;

  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-lg font-semibold mb-1">IT solutions — cost and recovery per month</h2>
        <p className="text-xs text-zinc-500 mb-4 max-w-2xl">
          Cost: WattWealth and Autotme invoices (SEK as booked in Fortnox), an invoice covering several months split evenly.
          Recovered: customer invoicing for the IT revenue streams (ex VAT). A month with no cost booked yet (typically the
          current one) shows no recovery %.
        </p>

        <div className="flex flex-wrap gap-3 mb-6">
          <Tile label="Total cost" value={`${formatSEK(total.cost)} SEK`} sub={`${costed[0]?.key ?? ""} – ${costed[costed.length - 1]?.key ?? ""}`} />
          <Tile label="Recovered from customers" value={`${formatSEK(total.revenue)} SEK`} sub={`${pct(ratio(total))} of cost`} />
          <Tile label="Net (recovered − cost)" value={`${formatSEK(total.revenue - total.cost)} SEK`} />
          <Tile
            label={`Last ${last3Count} months with cost`}
            value={pct(ratio(last3))}
            sub={`${formatSEK(last3.revenue)} of ${formatSEK(last3.cost)} SEK`}
          />
        </div>

        {/* One control row above what it scopes: the chart and the table follow the same view. */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-3 text-sm">
          <SegControl
            label="View"
            value={view}
            onChange={setView}
            options={[
              { value: "months", label: "Months" },
              { value: "years", label: "Years" },
            ]}
          />
          <SegControl
            label="Cost split"
            value={costSplit}
            onChange={setCostSplit}
            options={[
              { value: "none", label: "No split" },
              { value: "vendor", label: "Vendor" },
              { value: "roles", label: "Roles" },
            ]}
          />
          <SegControl
            label="Recovered split"
            value={revenueSplit}
            onChange={setRevenueSplit}
            options={[
              { value: "streams", label: "By stream" },
              { value: "none", label: "No split" },
            ]}
          />
        </div>
        {costSplit === "roles" && (
          <p className="text-xs text-zinc-500 mb-3 max-w-2xl">
            {teamMissing
              ? "Role split needs the team data from migration 0026 — until it is run, all cost shows as Unallocated."
              : "Estimated: each invoice is split across the people on it in proportion to a rough monthly rate per role, so the roles add up exactly to the invoice."}
          </p>
        )}

        <div className="mb-8">
          <ItChart
            title={view === "months" ? "Cost vs. recovered, per month (SEK)" : "Cost vs. recovered, per year (SEK)"}
            periods={view === "months" ? monthPeriods : yearPeriods}
            costSeries={costSeries}
            revenueSeries={revenueSeries}
          />
        </div>

        {view === "months" && (
          <div className="flex gap-3 mb-2 text-xs">
            <button className="underline" onClick={() => setFolded(new Set())}>
              Expand all years
            </button>
            <button className="underline" onClick={() => setFolded(new Set(years))}>
              Collapse all years
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="text-sm border-collapse w-full">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 px-3">{view === "months" ? "Month" : "Year"}</th>
                {costCols.map((c) => (
                  <th key={c.key} className={`py-2 px-3 text-right ${c.key === "__total" ? "border-l" : ""}`}>
                    {c.label}
                  </th>
                ))}
                {revenueCols.map((c, i) => (
                  <th key={c.key} className={`py-2 px-3 text-right ${c.key === "__total" || i === 0 ? "border-l" : ""}`}>
                    {c.label}
                  </th>
                ))}
                <th className="py-2 px-3 text-right">Net</th>
                <th className="py-2 px-3 text-right">Recovered %</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b font-semibold">
                <td className="py-2 px-3">Total</td>
                {dataCells(total)}
              </tr>

              {view === "years" &&
                yearRows.map((r) => (
                  <tr key={r.key} className="border-b">
                    <td className="py-2 px-3">{yearLabel(r.key)}</td>
                    {dataCells(r)}
                  </tr>
                ))}

              {view === "months" &&
                years.map((y) => {
                  const yr = yearRows.find((r) => r.key === y)!;
                  const isFolded = folded.has(y);
                  return (
                    <Fragment key={y}>
                      <tr
                        className="border-b font-medium bg-zinc-50 dark:bg-zinc-900 cursor-pointer select-none"
                        onClick={() => toggleYear(y)}
                      >
                        <td className="py-2 px-3">
                          <button
                            className="inline-flex items-center gap-1.5"
                            aria-expanded={!isFolded}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleYear(y);
                            }}
                          >
                            <span className="inline-block w-3 text-zinc-500">{isFolded ? "▸" : "▾"}</span>
                            {yearLabel(y)}
                          </button>
                        </td>
                        {dataCells(yr)}
                      </tr>
                      {!isFolded &&
                        monthRows
                          .filter((r) => r.key.startsWith(y))
                          .map((r) => (
                            <tr key={r.key} className="border-b">
                              <td className="py-2 px-3 pl-8">{r.key}</td>
                              {dataCells(r)}
                            </tr>
                          ))}
                    </Fragment>
                  );
                })}
              {monthRows.length === 0 && (
                <tr>
                  <td className="py-3 px-3 text-zinc-500" colSpan={colCount}>
                    No IT cost has been mapped yet.
                  </td>
                </tr>
              )}
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
                  <th className="py-2 px-3">Team (people per role)</th>
                  <th className="py-2 px-3">Note</th>
                  <th className="py-2 px-3" />
                </tr>
              </thead>
              <tbody>
                {data.unassigned.map((inv) => (
                  <UnassignedRow key={inv.fortnoxDocNumber} inv={inv} roles={data.roles} defaultTeams={defaultTeams} onSaved={load} />
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
                  <th className="py-2 px-3">Team</th>
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
                    <td className="py-2 px-3">{teamText(inv.team, data.roles)}</td>
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
