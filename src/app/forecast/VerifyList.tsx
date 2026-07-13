"use client";

import { useEffect, useState } from "react";
import { formatSEK } from "@/lib/format";

type VerificationRow = { id: string | null; type: "forecast" | "actual"; description: string; amount: number; date: string; status: string };

export default function VerifyList({ apiBase }: { apiBase: "sales" | "purchase" }) {
  const [rows, setRows] = useState<VerificationRow[] | null>(null);

  function load() {
    fetch(`/api/forecast/${apiBase}/verify`)
      .then((r) => r.json())
      .then(setRows);
  }

  useEffect(load, [apiBase]);

  async function dropForecast(id: string) {
    setRows((prev) => prev?.map((r) => (r.id === id ? { ...r, status: "dropped" } : r)) ?? prev);
    await fetch(`/api/forecast/${apiBase}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "dropped" }),
    });
  }

  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold mb-2">Forecast vs. actual (last 2 months, next 6 months)</h3>
      <div className="max-h-96 overflow-y-auto text-sm">
        {!rows ? (
          <p>Loading…</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left border-b sticky top-0 bg-background">
                <th className="py-2 px-3">Type</th>
                <th className="py-2 px-3">Description</th>
                <th className="py-2 px-3">Amount</th>
                <th className="py-2 px-3">Date</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b">
                  <td className="py-2 px-3">
                    <span
                      className={`px-1.5 py-0.5 rounded text-xs ${
                        row.type === "forecast" ? "bg-blue-900 text-blue-100" : "bg-green-900 text-green-100"
                      }`}
                    >
                      {row.type === "forecast" ? "Forecast" : "Actual"}
                    </span>
                  </td>
                  <td className="py-2 px-3">{row.description}</td>
                  <td className="py-2 px-3">{formatSEK(row.amount)}</td>
                  <td className="py-2 px-3">{row.date}</td>
                  <td className="py-2 px-3">{row.status}</td>
                  <td className="py-2 px-3">
                    {row.type === "forecast" && row.status === "forecast" && row.id && (
                      <button onClick={() => dropForecast(row.id!)} className="text-red-600 underline">
                        Drop
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
