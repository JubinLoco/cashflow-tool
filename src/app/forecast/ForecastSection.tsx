"use client";

import { useEffect, useState } from "react";
import { formatSEK } from "@/lib/format";

type ForecastRow = {
  id: string;
  description: string;
  amount: number;
  expected_date: string;
  status: "forecast" | "matched" | "dropped";
  recurring_group_id: string | null;
  [key: string]: unknown;
};

type Props = {
  title: string;
  apiBase: "sales" | "purchase";
  categoryField: "product_line" | "category";
  categoryOptions?: string[];
};

export default function ForecastSection({ title, apiBase, categoryField, categoryOptions }: Props) {
  const [rows, setRows] = useState<ForecastRow[]>([]);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(categoryOptions?.[0] ?? "");
  const [amount, setAmount] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [date, setDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [unit, setUnit] = useState<"day" | "week" | "month">("month");
  const [interval, setInterval] = useState("1");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState("");

  async function load() {
    const res = await fetch(`/api/forecast/${apiBase}`);
    setRows(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const dateInput = isRecurring
      ? { type: "recurring", startDate, endDate, unit, n: Number(interval) }
      : { type: "one_time", date };

    const body: Record<string, unknown> = {
      description,
      amount: Number(amount),
      dateInput,
      [categoryField]: category,
    };

    const res = await fetch(`/api/forecast/${apiBase}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setSubmitting(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Failed to create entry");
      return;
    }

    setDescription("");
    setAmount("");
    setDate("");
    setStartDate("");
    setEndDate("");
    load();
  }

  async function handleDelete(id: string, hasSeries: boolean) {
    const scope = hasSeries && confirm("Delete this and all remaining future occurrences in the series?")
      ? "future"
      : "single";
    await fetch(`/api/forecast/${apiBase}/${id}?scope=${scope}`, { method: "DELETE" });
    load();
  }

  function startEdit(row: ForecastRow) {
    setEditingId(row.id);
    setEditDescription(row.description);
    setEditAmount(String(row.amount));
    setEditDate(row.expected_date);
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

  return (
    <section className="flex-1 min-w-[320px]">
      <h2 className="text-lg font-semibold mb-3">{title}</h2>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2 mb-4 text-sm">
        <input
          className="border rounded px-2 py-1"
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />
        {categoryOptions ? (
          <select className="border rounded px-2 py-1" value={category} onChange={(e) => setCategory(e.target.value)}>
            {categoryOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : (
          <input
            className="border rounded px-2 py-1"
            placeholder="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
        )}
        <input
          className="border rounded px-2 py-1"
          type="number"
          placeholder="Amount (SEK)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />

        <label className="flex items-center gap-2">
          <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} />
          Repeating
        </label>

        {isRecurring ? (
          <div className="flex flex-wrap gap-2">
            <input
              className="border rounded px-2 py-1"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
            <span className="self-center">every</span>
            <input
              className="border rounded px-2 py-1 w-16"
              type="number"
              min="1"
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
            />
            <select className="border rounded px-2 py-1" value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)}>
              <option value="day">day(s)</option>
              <option value="week">week(s)</option>
              <option value="month">month(s)</option>
            </select>
            <span className="self-center">until</span>
            <input
              className="border rounded px-2 py-1"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </div>
        ) : (
          <input
            className="border rounded px-2 py-1"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        )}

        {error && <p className="text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-foreground text-background px-3 py-1.5 w-fit disabled:opacity-50"
        >
          Add
        </button>
      </form>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2 px-3">Description</th>
            <th className="py-2 px-3">Amount</th>
            <th className="py-2 px-3">Date</th>
            <th className="py-2 px-3">Status</th>
            <th className="py-2 px-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) =>
            editingId === row.id ? (
              <tr key={row.id} className="border-b">
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
                  <input
                    className="border rounded px-1 py-0.5"
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                  />
                </td>
                <td className="py-2 px-3">{row.status}</td>
                <td className="py-2 px-3 flex gap-2">
                  <button
                    onClick={() => handleSaveEdit(row.id, Boolean(row.recurring_group_id))}
                    className="text-green-700 underline"
                  >
                    Save
                  </button>
                  <button onClick={() => setEditingId(null)} className="underline">
                    Cancel
                  </button>
                </td>
              </tr>
            ) : (
              <tr key={row.id} className="border-b">
                <td className="py-2 px-3">{row.description}</td>
                <td className="py-2 px-3">{formatSEK(row.amount)}</td>
                <td className="py-2 px-3">{row.expected_date}</td>
                <td className="py-2 px-3">{row.status}</td>
                <td className="py-2 px-3 flex gap-2">
                  <button onClick={() => startEdit(row)} className="underline">
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(row.id, Boolean(row.recurring_group_id))}
                    className="text-red-600 underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </section>
  );
}
