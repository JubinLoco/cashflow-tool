"use client";

import { useEffect, useState } from "react";
import { formatSEK } from "@/lib/format";

type VerificationRow = {
  id: string | null;
  type: "forecast" | "actual";
  description: string;
  amount: number;
  date: string;
  secondaryDate: string | null;
  status: string;
  recurringGroupId: string | null;
};

const INVOICE_ENDPOINT: Record<"sales" | "purchase", "customer-invoices" | "supplier-invoices"> = {
  sales: "customer-invoices",
  purchase: "supplier-invoices",
};

// A sales forecast predicts when the sale/invoice happens, so the primary column and sort
// key is invoice date there; a purchase forecast predicts when we pay, so it's payment
// date for purchases. The secondary column is the other one, informational only.
const PRIMARY_DATE_LABEL: Record<"sales" | "purchase", string> = {
  sales: "Invoice date",
  purchase: "Payment date",
};
const SECONDARY_DATE_LABEL: Record<"sales" | "purchase", string> = {
  sales: "Payment date",
  purchase: "Invoice date",
};

export default function VerifyList({ apiBase, refreshSignal }: { apiBase: "sales" | "purchase"; refreshSignal?: number }) {
  const [rows, setRows] = useState<VerificationRow[] | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState("");

  function load() {
    fetch(`/api/forecast/${apiBase}/verify`)
      .then((r) => r.json())
      .then(setRows);
  }

  useEffect(load, [apiBase, refreshSignal]);

  async function setForecastStatus(id: string, status: "forecast" | "matched" | "dropped") {
    setRows((prev) => prev?.map((r) => (r.id === id ? { ...r, status } : r)) ?? prev);
    await fetch(`/api/forecast/${apiBase}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }

  async function setPaid(id: string, paid: boolean) {
    setRows((prev) => prev?.map((r) => (r.id === id ? { ...r, status: paid ? "paid" : "open" } : r)) ?? prev);
    await fetch(`/api/${INVOICE_ENDPOINT[apiBase]}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manual_paid: paid }),
    });
  }

  function startEdit(row: VerificationRow) {
    setEditingId(row.id);
    setEditDescription(row.description);
    setEditAmount(String(row.amount));
    setEditDate(row.date);
  }

  async function handleSaveEdit(id: string, hasSeries: boolean) {
    const applyToFuture =
      hasSeries &&
      confirm(
        "Apply the description/amount change to this and all remaining future occurrences too? (the date change only ever applies to this occurrence)",
      );

    if (applyToFuture) {
      await fetch(`/api/forecast/${apiBase}/${id}?scope=single`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expected_date: editDate }),
      });
      await fetch(`/api/forecast/${apiBase}/${id}?scope=future`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: editDescription, amount: Number(editAmount) }),
      });
    } else {
      await fetch(`/api/forecast/${apiBase}/${id}?scope=single`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: editDescription, amount: Number(editAmount), expected_date: editDate }),
      });
    }

    setEditingId(null);
    load();
  }

  async function handleDelete(id: string, hasSeries: boolean) {
    const scope = hasSeries && confirm("Delete this and all remaining future occurrences in the series?") ? "future" : "single";
    await fetch(`/api/forecast/${apiBase}/${id}?scope=${scope}`, { method: "DELETE" });
    load();
  }

  const visibleRows = (rows ?? []).filter((row) => {
    if (showResolved) return true;
    if (row.type === "forecast") return row.status === "forecast" || row.status === "derived";
    return row.status !== "paid";
  });

  return (
    <div className="mt-6">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-semibold">Forecast vs. actual (last 2 months, next 6 months)</h3>
        <label className="text-xs flex items-center gap-1">
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
          Show matched/dropped/paid
        </label>
      </div>
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
                <th className="py-2 px-3">{PRIMARY_DATE_LABEL[apiBase]}</th>
                <th className="py-2 px-3">{SECONDARY_DATE_LABEL[apiBase]}</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3" />
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, i) =>
                row.id && editingId === row.id ? (
                  <tr key={i} className="border-b">
                    <td className="py-2 px-3">
                      <span className="px-1.5 py-0.5 rounded text-xs bg-blue-900 text-blue-100">Forecast</span>
                    </td>
                    <td className="py-2 px-3">
                      <input
                        className="border rounded px-1 py-0.5 w-full"
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                      />
                    </td>
                    <td className="py-2 px-3">
                      <input
                        className="border rounded px-1 py-0.5 w-24"
                        type="number"
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                      />
                    </td>
                    <td className="py-2 px-3">
                      <input className="border rounded px-1 py-0.5" type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
                    </td>
                    <td className="py-2 px-3 text-zinc-500">—</td>
                    <td className="py-2 px-3">{row.status}</td>
                    <td className="py-2 px-3 flex gap-2">
                      <button onClick={() => handleSaveEdit(row.id!, Boolean(row.recurringGroupId))} className="text-green-700 underline">
                        Save
                      </button>
                      <button onClick={() => setEditingId(null)} className="underline">
                        Cancel
                      </button>
                    </td>
                  </tr>
                ) : (
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
                    <td className="py-2 px-3">{row.secondaryDate ?? "—"}</td>
                    <td className="py-2 px-3">{row.status}</td>
                    <td className="py-2 px-3 flex gap-2">
                      {row.type === "forecast" && row.status === "forecast" && row.id && (
                        <>
                          <button onClick={() => setForecastStatus(row.id!, "matched")} className="text-green-700 underline">
                            Match
                          </button>
                          <button onClick={() => setForecastStatus(row.id!, "dropped")} className="text-red-600 underline">
                            Drop
                          </button>
                        </>
                      )}
                      {row.type === "forecast" && (row.status === "matched" || row.status === "dropped") && row.id && (
                        <button onClick={() => setForecastStatus(row.id!, "forecast")} className="underline">
                          Undo
                        </button>
                      )}
                      {row.type === "forecast" && row.id && (
                        <>
                          <button onClick={() => startEdit(row)} className="underline">
                            Edit
                          </button>
                          <button onClick={() => handleDelete(row.id!, Boolean(row.recurringGroupId))} className="text-red-600 underline">
                            Delete
                          </button>
                        </>
                      )}
                      {row.type === "actual" && row.id && (
                        <button onClick={() => setPaid(row.id!, row.status !== "paid")} className="underline">
                          {row.status === "paid" ? "Mark unpaid" : "Mark paid"}
                        </button>
                      )}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
