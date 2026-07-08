"use client";

import { useState } from "react";

const PHASES = [
  { url: "/api/sync", label: "Pulling invoices from Fortnox…" },
  { url: "/api/factoring/recompute", label: "Recomputing factoring and cash events…" },
  { url: "/api/forecast/reconcile", label: "Reconciling forecasts against invoices…" },
];

export default function SyncButton() {
  const [status, setStatus] = useState<"idle" | "syncing" | "error">("idle");
  const [phaseLabel, setPhaseLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Run each phase as its own request rather than one combined call — the combined
  // pipeline occasionally exceeded Vercel's function timeout on the full invoice set,
  // while each phase alone stays comfortably within budget.
  async function handleSync() {
    setStatus("syncing");
    setError(null);

    for (const phase of PHASES) {
      setPhaseLabel(phase.label);
      const res = await fetch(phase.url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `Sync failed during: ${phase.label}`);
        setStatus("error");
        return;
      }
    }

    window.location.reload();
  }

  return (
    <div className="flex items-center gap-3 mb-6">
      <button
        onClick={handleSync}
        disabled={status === "syncing"}
        className="rounded bg-foreground text-background px-3 py-1.5 disabled:opacity-50"
      >
        {status === "syncing" ? "Syncing…" : "Sync now"}
      </button>
      {status === "syncing" && <span className="text-sm text-zinc-500">{phaseLabel}</span>}
      {status === "error" && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
