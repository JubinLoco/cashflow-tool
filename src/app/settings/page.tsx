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

const CATEGORY_OPTIONS = ["rent", "salaries", "tax", "suppliers", "factoring_fee", "other"];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({});
  const [limits, setLimits] = useState<FacilityLimits | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierCategory[]>([]);
  const [saved, setSaved] = useState(false);
  const [showUntaggedOnly, setShowUntaggedOnly] = useState(true);

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
