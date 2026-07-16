"use client";

import { useState } from "react";

type Props = {
  title: string;
  apiBase: "sales" | "purchase";
  categoryField: "product_line" | "category";
  categoryOptions?: string[];
  onAdded?: () => void;
};

export default function ForecastSection({ title, apiBase, categoryField, categoryOptions, onAdded }: Props) {
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(categoryOptions?.[0] ?? "");
  const [amount, setAmount] = useState("");
  const [marginPct, setMarginPct] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [date, setDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [unit, setUnit] = useState<"day" | "week" | "month">("month");
  const [interval, setInterval] = useState("1");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      ...(apiBase === "sales" && marginPct !== "" ? { expected_margin_pct: Number(marginPct) / 100 } : {}),
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
    setMarginPct("");
    setDate("");
    setStartDate("");
    setEndDate("");
    onAdded?.();
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
        {apiBase === "sales" && (
          <input
            className="border rounded px-2 py-1"
            type="number"
            step={0.1}
            placeholder="Expected margin % (optional)"
            value={marginPct}
            onChange={(e) => setMarginPct(e.target.value)}
          />
        )}

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
    </section>
  );
}
