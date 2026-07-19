"use client";

import { useEffect, useMemo, useState } from "react";
import settlementsData from "@/data/territories/settlements.json";
import settlementHistoryData from "@/data/territories/settlement-monthly-history.json";
import provincesGeojson from "@/data/territories/provinces.geojson.json";
import competitorsData from "@/data/territories/competitors.json";
import { classifyAllSettlements, type MonthlyHistoryMap } from "@/lib/territories/classifySettlements";
import { DEFAULT_GAME_CONFIG, tierLabel, type GameConfig, type Prospect, type TierRule } from "@/lib/territories/tiers";
import type { CompetitorRoster, ProvincesGeoJSON, Settlement } from "@/lib/territories/types";

const settlements = settlementsData as Settlement[];
const history = settlementHistoryData as MonthlyHistoryMap;
const provinces = (provincesGeojson as ProvincesGeoJSON).features.map((f) => f.properties.name).sort();
const roster = competitorsData as CompetitorRoster;

function formatSEK(n: number) {
  return `${Math.round(n).toLocaleString("sv-SE")} SEK`;
}

export default function TerritoriesSettlementsPage() {
  const [config, setConfig] = useState<GameConfig>(DEFAULT_GAME_CONFIG);
  const [loading, setLoading] = useState(true);
  const [draftRules, setDraftRules] = useState<TierRule[]>(DEFAULT_GAME_CONFIG.tierRules);
  const [rulesDirty, setRulesDirty] = useState(false);
  const [savingRules, setSavingRules] = useState(false);
  const [editingOverrideFor, setEditingOverrideFor] = useState<string | null>(null);
  const [overrideDraft, setOverrideDraft] = useState<{ tier: string; note: string }>({ tier: "", note: "" });
  const [editingPotentialFor, setEditingPotentialFor] = useState<string | null>(null);
  const [potentialDraft, setPotentialDraft] = useState<{ tier: string; note: string }>({ tier: "", note: "" });
  const [prospectDraft, setProspectDraft] = useState<Omit<Prospect, "id" | "createdAt">>({
    name: "",
    province: provinces[0],
    currentCompetitorId: null,
    potentialTier: "",
    note: "",
  });

  useEffect(() => {
    fetch("/api/territories/config")
      .then((r) => r.json())
      .then((c: GameConfig) => {
        setConfig(c);
        setDraftRules(c.tierRules);
        setLoading(false);
      });
  }, []);

  const classified = useMemo(() => classifyAllSettlements(settlements, history, config), [config]);

  function updateDraftRule(index: number, patch: Partial<TierRule>) {
    setDraftRules((rules) => rules.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    setRulesDirty(true);
  }

  function addRule() {
    const nextOrder = Math.max(-1, ...draftRules.map((r) => r.order)) + 1;
    setDraftRules((rules) => [
      ...rules,
      { id: `tier_${Date.now()}`, label: "New tier", order: nextOrder, minTurnover: 0, maxTurnover: null, minMarginPct: null, maxMarginPct: null },
    ]);
    setRulesDirty(true);
  }

  function removeRule(index: number) {
    setDraftRules((rules) => rules.filter((_, i) => i !== index));
    setRulesDirty(true);
  }

  async function saveRules() {
    setSavingRules(true);
    const res = await fetch("/api/territories/config/tier-rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draftRules),
    });
    const updated = (await res.json()) as GameConfig;
    setConfig(updated);
    setRulesDirty(false);
    setSavingRules(false);
  }

  async function saveOverride(customerNumber: string) {
    const res = await fetch(`/api/territories/config/overrides/${customerNumber}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(overrideDraft),
    });
    const updated = (await res.json()) as GameConfig;
    setConfig(updated);
    setEditingOverrideFor(null);
  }

  async function clearOverride(customerNumber: string) {
    const res = await fetch(`/api/territories/config/overrides/${customerNumber}`, { method: "DELETE" });
    const updated = (await res.json()) as GameConfig;
    setConfig(updated);
  }

  async function savePotential(customerNumber: string) {
    const res = await fetch(`/api/territories/config/potentials/${customerNumber}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(potentialDraft),
    });
    const updated = (await res.json()) as GameConfig;
    setConfig(updated);
    setEditingPotentialFor(null);
  }

  async function clearPotential(customerNumber: string) {
    const res = await fetch(`/api/territories/config/potentials/${customerNumber}`, { method: "DELETE" });
    const updated = (await res.json()) as GameConfig;
    setConfig(updated);
  }

  async function addProspect() {
    if (!prospectDraft.name.trim() || !prospectDraft.potentialTier) return;
    const res = await fetch("/api/territories/config/prospects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prospectDraft),
    });
    const updated = (await res.json()) as GameConfig;
    setConfig(updated);
    setProspectDraft({ name: "", province: provinces[0], currentCompetitorId: null, potentialTier: "", note: "" });
  }

  async function removeProspect(id: string) {
    const res = await fetch(`/api/territories/config/prospects/${id}`, { method: "DELETE" });
    const updated = (await res.json()) as GameConfig;
    setConfig(updated);
  }

  if (loading) {
    return <div className="max-w-5xl mx-auto w-full px-6 py-8 text-sm text-[var(--text-secondary)]">Loading…</div>;
  }

  return (
    <div className="max-w-5xl mx-auto w-full px-6 py-8 space-y-10">
      <header>
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Settlements</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-2">
          Settlement identity, turnover, and margin come from Fortnox (and later HubSpot) — not editable here.
          Tier thresholds and per-settlement classification overrides are game-specific config, stored locally by
          this app.
        </p>
      </header>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Tier rules</h2>
          <div className="flex gap-2">
            <button onClick={addRule} className="text-xs px-2.5 py-1 rounded-md border border-[var(--panel-border)] text-[var(--text-primary)] hover:bg-[var(--panel-surface)]">
              + Add rule
            </button>
            <button
              onClick={saveRules}
              disabled={!rulesDirty || savingRules}
              className="text-xs px-2.5 py-1 rounded-md bg-[#2a78d6] text-white disabled:opacity-40"
            >
              {savingRules ? "Saving…" : "Save rules"}
            </button>
          </div>
        </div>
        <p className="text-xs text-[var(--text-secondary)] mb-2">
          Evaluated in order (lowest first); the first rule a settlement matches on both turnover and margin wins.
          Leave a max blank for &quot;no upper bound&quot;. Turnover thresholds are <strong>average monthly</strong>{" "}
          turnover — the last 2 months with actual invoice activity, looking back at most 3 calendar months (so a
          dormant account ages out instead of coasting on old history). A settlement only promotes to a better tier
          after qualifying for 3 straight months, and only demotes after falling short for 2 straight months.
        </p>
        <div className="overflow-x-auto rounded-lg border border-[var(--panel-border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--panel-border)] text-left text-[var(--text-secondary)]">
                <th className="p-2 font-medium">Order</th>
                <th className="p-2 font-medium">Label</th>
                <th className="p-2 font-medium">Min monthly turnover</th>
                <th className="p-2 font-medium">Max monthly turnover</th>
                <th className="p-2 font-medium">Min margin %</th>
                <th className="p-2 font-medium">Max margin %</th>
                <th className="p-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {[...draftRules]
                .map((r, i) => ({ r, i }))
                .sort((a, b) => a.r.order - b.r.order)
                .map(({ r, i }) => (
                  <tr key={r.id} className="border-b border-[var(--panel-border)] last:border-0">
                    <td className="p-1.5">
                      <input
                        type="number"
                        value={r.order}
                        onChange={(e) => updateDraftRule(i, { order: Number(e.target.value) })}
                        className="w-14 bg-transparent border border-[var(--panel-border)] rounded px-1.5 py-0.5"
                      />
                    </td>
                    <td className="p-1.5">
                      <input
                        type="text"
                        value={r.label}
                        onChange={(e) => updateDraftRule(i, { label: e.target.value })}
                        className="w-28 bg-transparent border border-[var(--panel-border)] rounded px-1.5 py-0.5"
                      />
                    </td>
                    <td className="p-1.5">
                      <input
                        type="number"
                        value={r.minTurnover}
                        onChange={(e) => updateDraftRule(i, { minTurnover: Number(e.target.value) })}
                        className="w-28 bg-transparent border border-[var(--panel-border)] rounded px-1.5 py-0.5"
                      />
                    </td>
                    <td className="p-1.5">
                      <input
                        type="number"
                        value={r.maxTurnover ?? ""}
                        placeholder="none"
                        onChange={(e) => updateDraftRule(i, { maxTurnover: e.target.value === "" ? null : Number(e.target.value) })}
                        className="w-28 bg-transparent border border-[var(--panel-border)] rounded px-1.5 py-0.5"
                      />
                    </td>
                    <td className="p-1.5">
                      <input
                        type="number"
                        value={r.minMarginPct ?? ""}
                        placeholder="none"
                        onChange={(e) => updateDraftRule(i, { minMarginPct: e.target.value === "" ? null : Number(e.target.value) })}
                        className="w-20 bg-transparent border border-[var(--panel-border)] rounded px-1.5 py-0.5"
                      />
                    </td>
                    <td className="p-1.5">
                      <input
                        type="number"
                        value={r.maxMarginPct ?? ""}
                        placeholder="none"
                        onChange={(e) => updateDraftRule(i, { maxMarginPct: e.target.value === "" ? null : Number(e.target.value) })}
                        className="w-20 bg-transparent border border-[var(--panel-border)] rounded px-1.5 py-0.5"
                      />
                    </td>
                    <td className="p-1.5">
                      <button onClick={() => removeRule(i)} className="text-xs text-[var(--text-secondary)] hover:text-[#d03b3b]">
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
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">
          All settlements ({classified.length})
        </h2>
        <div className="overflow-x-auto rounded-lg border border-[var(--panel-border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--panel-border)] text-left text-[var(--text-secondary)]">
                <th className="p-2 font-medium">Name</th>
                <th className="p-2 font-medium">Province</th>
                <th className="p-2 font-medium">Turnover (12mo)</th>
                <th className="p-2 font-medium">Current monthly</th>
                <th className="p-2 font-medium">Margin</th>
                <th className="p-2 font-medium">Tier</th>
                <th className="p-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {classified.map((s) => (
                <tr key={s.customerNumber} className="border-b border-[var(--panel-border)] last:border-0 align-top">
                  <td className="p-2 text-[var(--text-primary)]">{s.name}</td>
                  <td className="p-2 text-[var(--text-secondary)]">{s.province ?? "—"}</td>
                  <td className="p-2 text-[var(--text-secondary)]">{formatSEK(s.trailing12moTurnover)}</td>
                  <td className="p-2 text-[var(--text-secondary)]">{formatSEK(s.currentMonthlyTurnover)}</td>
                  <td className="p-2 text-[var(--text-secondary)]">{s.marginPct != null ? `${s.marginPct}%` : "—"}</td>
                  <td className="p-2">
                    <span className="text-[var(--text-primary)]">{tierLabel(s.classification.tier, config.tierRules)}</span>
                    {s.classification.isOverridden && (
                      <span className="ml-1.5 text-xs text-[var(--text-secondary)]">
                        (override, current signal says {tierLabel(s.classification.ruleTier, config.tierRules)})
                      </span>
                    )}
                    {!s.classification.isOverridden && s.classification.ruleTier !== s.classification.tier && (
                      <span className="ml-1.5 text-xs text-[var(--text-secondary)]">
                        (trending toward {tierLabel(s.classification.ruleTier, config.tierRules)})
                      </span>
                    )}
                    {config.potentials[s.customerNumber] && (
                      <div className="text-xs text-[#2a78d6] mt-0.5">
                        potential: {tierLabel(config.potentials[s.customerNumber].tier, config.tierRules)}
                        {config.potentials[s.customerNumber].note && ` — ${config.potentials[s.customerNumber].note}`}
                      </div>
                    )}
                  </td>
                  <td className="p-2">
                    {editingOverrideFor === s.customerNumber ? (
                      <div className="flex items-center gap-1.5">
                        <select
                          value={overrideDraft.tier}
                          onChange={(e) => setOverrideDraft((d) => ({ ...d, tier: e.target.value }))}
                          className="bg-transparent border border-[var(--panel-border)] rounded px-1.5 py-0.5 text-xs"
                        >
                          {config.tierRules.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          placeholder="reason"
                          value={overrideDraft.note}
                          onChange={(e) => setOverrideDraft((d) => ({ ...d, note: e.target.value }))}
                          className="w-32 bg-transparent border border-[var(--panel-border)] rounded px-1.5 py-0.5 text-xs"
                        />
                        <button onClick={() => saveOverride(s.customerNumber)} className="text-xs text-[#0ca30c]">
                          Save
                        </button>
                        <button onClick={() => setEditingOverrideFor(null)} className="text-xs text-[var(--text-secondary)]">
                          Cancel
                        </button>
                      </div>
                    ) : editingPotentialFor === s.customerNumber ? (
                      <div className="flex items-center gap-1.5">
                        <select
                          value={potentialDraft.tier}
                          onChange={(e) => setPotentialDraft((d) => ({ ...d, tier: e.target.value }))}
                          className="bg-transparent border border-[var(--panel-border)] rounded px-1.5 py-0.5 text-xs"
                        >
                          {config.tierRules.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          placeholder="reason"
                          value={potentialDraft.note}
                          onChange={(e) => setPotentialDraft((d) => ({ ...d, note: e.target.value }))}
                          className="w-32 bg-transparent border border-[var(--panel-border)] rounded px-1.5 py-0.5 text-xs"
                        />
                        <button onClick={() => savePotential(s.customerNumber)} className="text-xs text-[#0ca30c]">
                          Save
                        </button>
                        <button onClick={() => setEditingPotentialFor(null)} className="text-xs text-[var(--text-secondary)]">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setEditingOverrideFor(s.customerNumber);
                            setOverrideDraft({ tier: s.classification.tier, note: "" });
                          }}
                          className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline"
                        >
                          Reclassify
                        </button>
                        {s.classification.isOverridden && (
                          <button
                            onClick={() => clearOverride(s.customerNumber)}
                            className="text-xs text-[var(--text-secondary)] hover:text-[#d03b3b]"
                          >
                            Clear
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setEditingPotentialFor(s.customerNumber);
                            setPotentialDraft({ tier: s.classification.tier, note: "" });
                          }}
                          className="text-xs text-[#2a78d6] hover:underline"
                        >
                          Set potential
                        </button>
                        {config.potentials[s.customerNumber] && (
                          <button
                            onClick={() => clearPotential(s.customerNumber)}
                            className="text-xs text-[var(--text-secondary)] hover:text-[#d03b3b]"
                          >
                            Clear potential
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">
          Prospects ({config.prospects.length})
        </h2>
        <p className="text-xs text-[var(--text-secondary)] mb-3">
          Settlements DSEG doesn&apos;t hold yet — competitor-held accounts or leads worth targeting. Meant to be fed
          by HubSpot once that&apos;s connected; manually tracked for now.
        </p>
        <div className="rounded-lg border border-[var(--panel-border)] p-3 mb-3 flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-0.5">Name</label>
            <input
              type="text"
              value={prospectDraft.name}
              onChange={(e) => setProspectDraft((d) => ({ ...d, name: e.target.value }))}
              className="w-40 bg-transparent border border-[var(--panel-border)] rounded px-1.5 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-0.5">Province</label>
            <select
              value={prospectDraft.province}
              onChange={(e) => setProspectDraft((d) => ({ ...d, province: e.target.value }))}
              className="bg-transparent border border-[var(--panel-border)] rounded px-1.5 py-1 text-sm"
            >
              {provinces.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-0.5">Currently held by</label>
            <select
              value={prospectDraft.currentCompetitorId ?? ""}
              onChange={(e) => setProspectDraft((d) => ({ ...d, currentCompetitorId: e.target.value || null }))}
              className="bg-transparent border border-[var(--panel-border)] rounded px-1.5 py-1 text-sm"
            >
              <option value="">Unknown</option>
              {roster.empires.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-0.5">Potential tier</label>
            <select
              value={prospectDraft.potentialTier}
              onChange={(e) => setProspectDraft((d) => ({ ...d, potentialTier: e.target.value }))}
              className="bg-transparent border border-[var(--panel-border)] rounded px-1.5 py-1 text-sm"
            >
              <option value="">Select…</option>
              {config.tierRules.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[10rem]">
            <label className="block text-xs text-[var(--text-secondary)] mb-0.5">Note</label>
            <input
              type="text"
              value={prospectDraft.note}
              onChange={(e) => setProspectDraft((d) => ({ ...d, note: e.target.value }))}
              className="w-full bg-transparent border border-[var(--panel-border)] rounded px-1.5 py-1 text-sm"
            />
          </div>
          <button onClick={addProspect} className="text-xs px-3 py-1.5 rounded-md bg-[#2a78d6] text-white">
            Add prospect
          </button>
        </div>

        {config.prospects.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-[var(--panel-border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--panel-border)] text-left text-[var(--text-secondary)]">
                  <th className="p-2 font-medium">Name</th>
                  <th className="p-2 font-medium">Province</th>
                  <th className="p-2 font-medium">Currently held by</th>
                  <th className="p-2 font-medium">Potential tier</th>
                  <th className="p-2 font-medium">Note</th>
                  <th className="p-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {config.prospects.map((p) => {
                  const competitor = roster.empires.find((c) => c.id === p.currentCompetitorId);
                  return (
                    <tr key={p.id} className="border-b border-[var(--panel-border)] last:border-0">
                      <td className="p-2 text-[var(--text-primary)]">{p.name}</td>
                      <td className="p-2 text-[var(--text-secondary)]">{p.province}</td>
                      <td className="p-2 text-[var(--text-secondary)]">{competitor?.displayName ?? "Unknown"}</td>
                      <td className="p-2 text-[var(--text-secondary)]">{tierLabel(p.potentialTier, config.tierRules)}</td>
                      <td className="p-2 text-[var(--text-secondary)]">{p.note || "—"}</td>
                      <td className="p-2">
                        <button onClick={() => removeProspect(p.id)} className="text-xs text-[var(--text-secondary)] hover:text-[#d03b3b]">
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
