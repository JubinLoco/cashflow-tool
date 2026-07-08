"use client";

import { useState } from "react";

export default function SyncButton() {
  const [status, setStatus] = useState<"idle" | "syncing" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSync() {
    setStatus("syncing");
    setError(null);

    const res = await fetch("/api/sync/full");
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Sync failed");
      setStatus("error");
      return;
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
      {status === "syncing" && (
        <span className="text-sm text-zinc-500">Pulling invoices from Fortnox and recomputing — this can take a bit.</span>
      )}
      {status === "error" && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
