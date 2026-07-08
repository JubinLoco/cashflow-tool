export type RecurrenceUnit = "day" | "week" | "month";

function addInterval(date: Date, unit: RecurrenceUnit, n: number): Date {
  const d = new Date(date);
  if (unit === "day") d.setUTCDate(d.getUTCDate() + n);
  else if (unit === "week") d.setUTCDate(d.getUTCDate() + n * 7);
  else d.setUTCMonth(d.getUTCMonth() + n);
  return d;
}

// Bounded end date means every occurrence can be materialized upfront — no
// background job needed to keep extending the series into the future.
export function generateOccurrenceDates(
  startDate: string,
  unit: RecurrenceUnit,
  n: number,
  endDate: string,
): string[] {
  if (n <= 0) throw new Error("Recurrence interval must be a positive number");
  const dates: string[] = [];
  const end = new Date(endDate);
  let current = new Date(startDate);

  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current = addInterval(current, unit, n);
  }

  return dates;
}
