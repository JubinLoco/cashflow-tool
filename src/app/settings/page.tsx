"use client";

import { useEffect, useState } from "react";

type Settings = {
  starting_balance?: number;
  danger_warning_threshold?: number;
  danger_bankruptcy_threshold?: number;
  tax_buffer_threshold?: number;
};

type FacilityLimits = {
  id: string;
  total_eligible_credit: number;
  customer_cap_pct: number;
  invoice_cap_pct: number;
  effective_from: string;
};

type SupplierCategory = { supplier_number: string; supplier_name: string; category: string | null };

type FactoringOverride = {
  id: string;
  fortnox_doc_number: string;
  reason_code: string | null;
  reason_description: string | null;
  treatment: "exclude_entirely" | "full_amount_on_payment";
  noted_date: string;
};

const CATEGORY_OPTIONS = ["rent", "salaries", "tax", "suppliers", "factoring_fee", "other"];

const TREATMENT_LABEL: Record<string, string> = {
  exclude_entirely: "Exclude entirely (not confident we'll collect it)",
  full_amount_on_payment: "Include 100% when customer pays",
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({});
  const [limits, setLimits] = useState<FacilityLimits | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierCategory[]>([]);
  const [overrides, setOverrides] = useState<FactoringOverride[]>([]);
  const [saved, setSaved] = useState(false);
  const [showUntaggedOnly, setShowUntaggedOnly] = useState(true);
  const [newOverride, setNewOverride] = useState({
    fortnox_doc_number: "",
    reason_code: "",
    reason_description: "",
    treatment: "exclude_entirely" as FactoringOverride["treatment"],
  });

  function load() {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setSettings(d.settings);
        setLimits(d.facilityLimits);
      });
    fetch("/api/supplier-categories")
      .then((r) => r.json())
      .then(setSuppliers);
    fetch("/api/settings/factoring-overrides")
      .then((r) => r.json())
      .then(setOverrides);
  }

  useEffect(load, []);

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings }),
    });
    flashSaved();
  }

  async function saveLimits(e: React.FormEvent) {
    e.preventDefault();
    if (!limits) return;
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        facilityLimits: {
          total_eligible_credit: limits.total_eligible_credit,
          customer_cap_pct: limits.customer_cap_pct,
          invoice_cap_pct: limits.invoice_cap_pct,
        },
      }),
    });
    flashSaved();
    load();
  }

  async function updateSupplierCategory(supplier_number: string, category: string) {
    setSuppliers((prev) => prev.map((s) => (s.supplier_number === supplier_number ? { ...s, category } : s)));
    await fetch("/api/supplier-categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplier_number, category }),
    });
  }

  async function addOverride(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/settings/factoring-overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newOverride),
    });
    setNewOverride({ fortnox_doc_number: "", reason_code: "", reason_description: "", treatment: "exclude_entirely" });
    fetch("/api/settings/factoring-overrides")
      .then((r) => r.json())
      .then(setOverrides);
  }

  async function removeOverride(id: string) {
    setOverrides((prev) => prev.filter((o) => o.id !== id));
    await fetch(`/api/settings/factoring-overrides/${id}`, { method: "DELETE" });
  }

  function flashSaved() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  const visibleSuppliers = showUntaggedOnly ? suppliers.filter((s) => !s.category) : suppliers;

  return (
    <main className="p-10 font-sans max-w-3xl mx-auto flex flex-col gap-10">
      <h1 className="text-2xl font-semibold">Settings</h1>
      {saved && <p className="text-green-700 text-sm">Saved.</p>}

      <section>
        <h2 className="text-lg font-semibold mb-3">Balance & danger thresholds</h2>
        <form onSubmit={saveSettings} className="flex flex-col gap-2 text-sm max-w-xs">
          <NumberField
            label="Starting balance (SEK)"
            value={settings.starting_balance}
            onChange={(v) => setSettings((s) => ({ ...s, starting_balance: v }))}
          />
          <NumberField
            label="Tax buffer threshold (SEK)"
            value={settings.tax_buffer_threshold}
            onChange={(v) => setSettings((s) => ({ ...s, tax_buffer_threshold: v }))}
          />
          <NumberField
            label="Warning threshold (SEK)"
            value={settings.danger_warning_threshold}
            onChange={(v) => setSettings((s) => ({ ...s, danger_warning_threshold: v }))}
          />
          <NumberField
            label="Bankruptcy threshold (SEK)"
            value={settings.danger_bankruptcy_threshold}
            onChange={(v) => setSettings((s) => ({ ...s, danger_bankruptcy_threshold: v }))}
          />
          <button type="submit" className="rounded bg-foreground text-background px-3 py-1.5 w-fit mt-2">
            Save
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Factoring facility</h2>
        {limits && (
          <form onSubmit={saveLimits} className="flex flex-col gap-2 text-sm max-w-xs">
            <p className="text-xs text-zinc-500">Effective from {limits.effective_from}. Editing creates/updates today&apos;s entry.</p>
            <NumberField
              label="Total eligible credit (SEK)"
              value={limits.total_eligible_credit}
              onChange={(v) => setLimits((l) => (l ? { ...l, total_eligible_credit: v } : l))}
            />
            <NumberField
              label="Per-customer cap (0-1)"
              value={limits.customer_cap_pct}
              step={0.01}
              onChange={(v) => setLimits((l) => (l ? { ...l, customer_cap_pct: v } : l))}
            />
            <NumberField
              label="Per-invoice cap (0-1)"
              value={limits.invoice_cap_pct}
              step={0.01}
              onChange={(v) => setLimits((l) => (l ? { ...l, invoice_cap_pct: v } : l))}
            />
            <button type="submit" className="rounded bg-foreground text-background px-3 py-1.5 w-fit mt-2">
              Save
            </button>
          </form>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-1">Factoring exceptions</h2>
        <p className="text-xs text-zinc-500 mb-3 max-w-md">
          Invoices the factoring company has reported as not eligible (disputed, bankruptcy, rejected payment terms,
          etc.) — overrides our own pool-cap estimate for that specific invoice.
        </p>
        <form onSubmit={addOverride} className="flex flex-wrap gap-2 text-sm mb-4 items-end">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">Fortnox invoice #</span>
            <input
              className="border rounded px-2 py-1 w-28"
              value={newOverride.fortnox_doc_number}
              onChange={(e) => setNewOverride((o) => ({ ...o, fortnox_doc_number: e.target.value }))}
              required
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">Reason code</span>
            <input
              className="border rounded px-2 py-1 w-20"
              value={newOverride.reason_code}
              onChange={(e) => setNewOverride((o) => ({ ...o, reason_code: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">Reason</span>
            <input
              className="border rounded px-2 py-1 w-40"
              value={newOverride.reason_description}
              onChange={(e) => setNewOverride((o) => ({ ...o, reason_description: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">Treatment</span>
            <select
              className="border rounded px-2 py-1"
              value={newOverride.treatment}
              onChange={(e) =>
                setNewOverride((o) => ({ ...o, treatment: e.target.value as FactoringOverride["treatment"] }))
              }
            >
              {Object.entries(TREATMENT_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="rounded bg-foreground text-background px-3 py-1.5">
            Add
          </button>
        </form>

        <div className="max-h-64 overflow-y-auto text-sm">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left border-b sticky top-0 bg-background">
                <th className="py-1">Invoice #</th>
                <th className="py-1">Reason</th>
                <th className="py-1">Treatment</th>
                <th className="py-1">Noted</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {overrides.map((o) => (
                <tr key={o.id} className="border-b">
                  <td className="py-1">{o.fortnox_doc_number}</td>
                  <td className="py-1">
                    {o.reason_code ? `${o.reason_code} — ` : ""}
                    {o.reason_description}
                  </td>
                  <td className="py-1">{TREATMENT_LABEL[o.treatment] ?? o.treatment}</td>
                  <td className="py-1">{o.noted_date}</td>
                  <td className="py-1">
                    <button onClick={() => removeOverride(o.id)} className="text-red-600 underline">
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-semibold">Supplier categories</h2>
          <label className="text-xs flex items-center gap-1">
            <input type="checkbox" checked={showUntaggedOnly} onChange={(e) => setShowUntaggedOnly(e.target.checked)} />
            Untagged only
          </label>
        </div>
        <div className="max-h-96 overflow-y-auto text-sm">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left border-b sticky top-0 bg-background">
                <th className="py-1">Supplier</th>
                <th className="py-1">Category</th>
              </tr>
            </thead>
            <tbody>
              {visibleSuppliers.map((s) => (
                <tr key={s.supplier_number} className="border-b">
                  <td className="py-1">{s.supplier_name}</td>
                  <td className="py-1">
                    <select
                      className="border rounded px-1 py-0.5"
                      value={s.category ?? ""}
                      onChange={(e) => updateSupplierCategory(s.supplier_number, e.target.value)}
                    >
                      <option value="" disabled>
                        Choose…
                      </option>
                      {CATEGORY_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function NumberField({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number | undefined;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-zinc-500">{label}</span>
      <input
        className="border rounded px-2 py-1"
        type="number"
        step={step ?? 1}
        value={value ?? ""}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
