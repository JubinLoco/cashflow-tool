import { classifyByRules, type TierRule } from "./tiers";

export type MonthlyRecord = { yearMonth: string; turnover: number; marginPct: number | null };

// The "current" monthly turnover signal for classification: average of the last 2 months
// that actually had invoice activity, but never reaching back more than 3 calendar months.
// This handles two real patterns at once -- weekly-ordering residential customers (whose
// only gaps are July / late Dec / Jan vacations) read correctly through the gap, and the
// handful of quarterly C&I accounts (Brion, Helios, Anders Elektriska, Broderman) get
// evaluated on their real last two orders. The 3-month cap is what makes a customer who
// stops buying entirely fall out of a high tier instead of coasting on stale history.
const LOOKBACK_MONTHS = 3;
const ACTIVE_MONTHS_TO_AVERAGE = 2;

// Hysteresis: a settlement must qualify for a better tier for 3 straight months before it
// actually promotes (stops one lucky month from flipping the board), but only needs to fall
// short for 2 straight months before it demotes (a dormant account shouldn't coast for long).
const PROMOTION_STREAK = 3;
const DEMOTION_STREAK = 2;

function monthIndex(yearMonth: string): number {
  const [y, m] = yearMonth.split("-").map(Number);
  return y * 12 + (m - 1);
}

function tierRank(tierId: string, rules: TierRule[]): number {
  const rule = rules.find((r) => r.id === tierId);
  if (!rule) return -1; // unknown ranks below every real tier
  const maxOrder = Math.max(...rules.map((r) => r.order));
  return maxOrder - rule.order; // lower `order` = better tier -> higher rank number
}

function candidateTierAt(history: MonthlyRecord[], asOfIdx: number, rules: TierRule[]): string {
  const windowStart = asOfIdx - (LOOKBACK_MONTHS - 1);
  const activeInWindow = history
    .filter((h) => {
      const idx = monthIndex(h.yearMonth);
      return idx >= windowStart && idx <= asOfIdx;
    })
    .sort((a, b) => monthIndex(b.yearMonth) - monthIndex(a.yearMonth))
    .slice(0, ACTIVE_MONTHS_TO_AVERAGE);

  if (activeInWindow.length === 0) return classifyByRules(0, null, rules);

  const avgTurnover = activeInWindow.reduce((sum, h) => sum + h.turnover, 0) / activeInWindow.length;
  const marginValues = activeInWindow.map((h) => h.marginPct).filter((m): m is number => m != null);
  const avgMargin = marginValues.length ? marginValues.reduce((sum, m) => sum + m, 0) / marginValues.length : null;
  return classifyByRules(avgTurnover, avgMargin, rules);
}

export type TierHistoryResult = {
  /** The settlement's official tier as of the latest month, after applying hysteresis. */
  tier: string;
  /** What the raw rules would say right now, before hysteresis -- shown for transparency. */
  candidateTier: string;
  /** Average monthly turnover behind the current candidate figure (last 2 active months, capped at 3). */
  currentMonthlyTurnover: number;
};

export function computeCurrentTier(
  history: MonthlyRecord[],
  rules: TierRule[],
  globalLatestYearMonth: string,
): TierHistoryResult {
  if (history.length === 0) {
    return { tier: "unknown", candidateTier: "unknown", currentMonthlyTurnover: 0 };
  }

  const sorted = [...history].sort((a, b) => monthIndex(a.yearMonth) - monthIndex(b.yearMonth));
  const firstIdx = monthIndex(sorted[0].yearMonth);
  const lastIdx = monthIndex(globalLatestYearMonth);

  let officialTier = candidateTierAt(sorted, firstIdx, rules);
  let upStreak = 0;
  let downStreak = 0;

  for (let idx = firstIdx; idx <= lastIdx; idx++) {
    const candidate = candidateTierAt(sorted, idx, rules);
    const candidateRank = tierRank(candidate, rules);
    const officialRank = tierRank(officialTier, rules);

    if (candidateRank > officialRank) {
      upStreak += 1;
      downStreak = 0;
      if (upStreak >= PROMOTION_STREAK) {
        officialTier = candidate;
        upStreak = 0;
      }
    } else if (candidateRank < officialRank) {
      downStreak += 1;
      upStreak = 0;
      if (downStreak >= DEMOTION_STREAK) {
        officialTier = candidate;
        downStreak = 0;
      }
    } else {
      upStreak = 0;
      downStreak = 0;
    }
  }

  const finalCandidate = candidateTierAt(sorted, lastIdx, rules);
  const windowStart = lastIdx - (LOOKBACK_MONTHS - 1);
  const activeInWindow = sorted
    .filter((h) => monthIndex(h.yearMonth) >= windowStart && monthIndex(h.yearMonth) <= lastIdx)
    .sort((a, b) => monthIndex(b.yearMonth) - monthIndex(a.yearMonth))
    .slice(0, ACTIVE_MONTHS_TO_AVERAGE);
  const currentMonthlyTurnover = activeInWindow.length
    ? activeInWindow.reduce((sum, h) => sum + h.turnover, 0) / activeInWindow.length
    : 0;

  return { tier: officialTier, candidateTier: finalCandidate, currentMonthlyTurnover };
}
