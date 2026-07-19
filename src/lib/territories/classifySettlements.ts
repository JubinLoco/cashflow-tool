import { computeCurrentTier, type MonthlyRecord } from "./tierHistory";
import { classifySettlement, type GameConfig } from "./tiers";
import type { Settlement } from "./types";

export type MonthlyHistoryMap = Record<string, MonthlyRecord[]>;

export function findLatestYearMonth(historyByCustomer: MonthlyHistoryMap): string {
  let latest = "0000-00";
  for (const records of Object.values(historyByCustomer)) {
    for (const r of records) {
      if (r.yearMonth > latest) latest = r.yearMonth;
    }
  }
  return latest;
}

export type ClassifiedSettlement = Settlement & {
  classification: ReturnType<typeof classifySettlement>;
  currentMonthlyTurnover: number;
};

/** Applies the monthly-history hysteresis engine + manual overrides to every settlement. */
export function classifyAllSettlements(
  settlements: Settlement[],
  historyByCustomer: MonthlyHistoryMap,
  config: GameConfig,
): ClassifiedSettlement[] {
  const latestYearMonth = findLatestYearMonth(historyByCustomer);

  return settlements.map((s) => {
    const history = historyByCustomer[s.customerNumber] ?? [];
    const { tier, candidateTier, currentMonthlyTurnover } = computeCurrentTier(history, config.tierRules, latestYearMonth);
    const classification = classifySettlement(s.customerNumber, tier, candidateTier, config);
    return { ...s, classification, currentMonthlyTurnover };
  });
}
