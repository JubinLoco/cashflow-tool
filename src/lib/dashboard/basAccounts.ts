// Swedish BAS chart of accounts, aggregate-MVP mapping (no per-department breakdown —
// that's the whole point of the aggregate scope). Class 3 = revenue (credit-natured).
// Classes 4-8 = costs (debit-natured): 4xxx material/goods (COGS), 5xxx-8xxx everything
// else (other external costs, personnel, depreciation, financial items, tax) folded into
// a single Opex bucket to match monthly_budget's three columns exactly. Classes 1-2
// (assets/equity+liabilities) are out of scope for the P&L and return null.
export type PnlBucket = "turnover" | "cogs" | "opex";

export function classifyAccount(accountNumber: string): PnlBucket | null {
  const n = Number(accountNumber);
  if (!Number.isFinite(n)) return null;
  if (n >= 3000 && n <= 3999) return "turnover";
  if (n >= 4000 && n <= 4999) return "cogs";
  if (n >= 5000 && n <= 8999) return "opex";
  return null;
}
