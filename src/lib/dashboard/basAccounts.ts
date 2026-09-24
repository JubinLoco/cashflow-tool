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

// Balance-sheet counterpart, for solvency/liquidity ratios (Soliditet, Kassalikviditet,
// etc.) — additive, doesn't affect classifyAccount()/the P&L above. Classes 1-2, credit-
// natured for equity/liabilities same as turnover above (negated where accumulated).
export type BalanceSheetBucket =
  | "fixedAssets" // 1000-1399: Anläggningstillgångar (immateriella/materiella/finansiella)
  | "inventory" // 1400-1499: Varulager
  | "currentAssetsOther" // 1500-1999: kortfristiga fordringar + kassa/bank — this is exactly
  //   Kassalikviditet's numerator (current assets excl. inventory)
  | "equity" // 2000-2099: Eget kapital
  | "longTermLiabilities" // 2100-2399: obeskattade reserver, avsättningar, långfristiga skulder
  | "currentLiabilities"; // 2400-2999: kortfristiga skulder

export function classifyBalanceSheetAccount(accountNumber: string): BalanceSheetBucket | null {
  const n = Number(accountNumber);
  if (!Number.isFinite(n)) return null;
  if (n >= 1000 && n <= 1399) return "fixedAssets";
  if (n >= 1400 && n <= 1499) return "inventory";
  if (n >= 1500 && n <= 1999) return "currentAssetsOther";
  if (n >= 2000 && n <= 2099) return "equity";
  if (n >= 2100 && n <= 2399) return "longTermLiabilities";
  if (n >= 2400 && n <= 2999) return "currentLiabilities";
  return null;
}
