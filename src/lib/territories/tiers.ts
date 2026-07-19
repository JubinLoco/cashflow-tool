export type TierRule = {
  id: string;
  label: string;
  order: number; // evaluated lowest-first; first match wins
  minTurnover: number; // inclusive SEK, evaluated against a settlement's AVERAGE MONTHLY turnover
  maxTurnover: number | null; // inclusive SEK, null = no cap
  minMarginPct: number | null; // inclusive %, null = no floor
  maxMarginPct: number | null; // inclusive %, null = no ceiling
};

// Thresholds are monthly (average monthly turnover over the trailing 12 months), not
// annual -- the original 500k/1M/1.5M/2M SEK bands DSEG described were annual-scale
// figures, rescaled /12 here so the same real account sizes land in the same tiers.
export const DEFAULT_TIER_RULES: TierRule[] = [
  { id: "metropolis", label: "Metropolis", order: 0, minTurnover: 125_000, maxTurnover: null, minMarginPct: 10, maxMarginPct: null },
  { id: "city", label: "City", order: 1, minTurnover: 166_667, maxTurnover: null, minMarginPct: null, maxMarginPct: null },
  { id: "town", label: "Town", order: 2, minTurnover: 83_333, maxTurnover: null, minMarginPct: null, maxMarginPct: null },
  { id: "mid_village", label: "Mid-village", order: 3, minTurnover: 41_667, maxTurnover: null, minMarginPct: null, maxMarginPct: null },
  { id: "village", label: "Village", order: 4, minTurnover: 0, maxTurnover: null, minMarginPct: null, maxMarginPct: null },
];

export type SettlementOverride = {
  tier: string;
  note: string;
  setAt: string;
};

// An aspirational annotation on one of DSEG's OWN settlements -- "we're actively working to
// upgrade this one" -- shown alongside the real (computed/overridden) tier, not replacing it.
export type SettlementPotential = {
  tier: string;
  note: string;
  setAt: string;
};

// A settlement DSEG doesn't hold yet, tracked as a conquest target. Meant to be fed by
// HubSpot (competitor-held accounts, or our own prospects) once that integration exists;
// manually entered for now.
export type Prospect = {
  id: string;
  name: string;
  province: string;
  currentCompetitorId: string | null; // null = unknown / unaffiliated
  potentialTier: string;
  note: string;
  createdAt: string;
};

/** Human label for a tier id -- looks up the live rule's label so a renamed or custom
 * tier (e.g. a user-added rule whose id is a generated `tier_<timestamp>`) never surfaces
 * its raw id; falls back to a de-slugged id only if the rule has since been deleted. */
export function tierLabel(tierId: string, rules: TierRule[]): string {
  return rules.find((r) => r.id === tierId)?.label ?? tierId.replace(/_/g, " ");
}

export type GameConfig = {
  tierRules: TierRule[];
  overrides: Record<string, SettlementOverride>;
  potentials: Record<string, SettlementPotential>;
  prospects: Prospect[];
};

export const DEFAULT_GAME_CONFIG: GameConfig = {
  tierRules: DEFAULT_TIER_RULES,
  overrides: {},
  potentials: {},
  prospects: [],
};

/** Rule-based classification only -- ignores overrides. Used as the "would-be" tier a rule assigns. */
export function classifyByRules(monthlyTurnover: number, marginPct: number | null, rules: TierRule[]): string {
  const sorted = [...rules].sort((a, b) => a.order - b.order);
  for (const r of sorted) {
    const turnoverOk = monthlyTurnover >= r.minTurnover && (r.maxTurnover == null || monthlyTurnover <= r.maxTurnover);
    const marginOk =
      marginPct == null
        ? r.minMarginPct == null && r.maxMarginPct == null
        : (r.minMarginPct == null || marginPct >= r.minMarginPct) &&
          (r.maxMarginPct == null || marginPct <= r.maxMarginPct);
    if (turnoverOk && marginOk) return r.id;
  }
  return "unknown";
}

/**
 * Final tier for a settlement: manual override wins if present, else the tier produced by
 * the monthly-history hysteresis engine (see tierHistory.ts) -- NOT a point-in-time rule
 * check, since promotion/demotion require a sustained streak, not just the latest month.
 */
export function classifySettlement(
  customerNumber: string,
  historyTier: string,
  candidateTier: string,
  config: GameConfig,
): { tier: string; ruleTier: string; isOverridden: boolean; overrideNote?: string } {
  const override = config.overrides[customerNumber];
  if (override) {
    return { tier: override.tier, ruleTier: candidateTier, isOverridden: true, overrideNote: override.note };
  }
  return { tier: historyTier, ruleTier: candidateTier, isOverridden: false };
}
