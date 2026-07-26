export type YearFigure = {
  year: number;
  revenueSEK: number;
  profitSEK: number | null;
  confidence: string;
  isPartial?: boolean;
};

export type CompetitorFinancials = {
  id: string;
  displayName: string;
  isPlayer?: boolean;
  years: YearFigure[];
};

function latestRevenue(c: CompetitorFinancials): number {
  const latestYear = Math.max(...c.years.map((y) => y.year));
  return c.years.find((y) => y.year === latestYear)!.revenueSEK;
}

/**
 * Splits competitors into two groups at their single biggest turnover gap (ratio between
 * consecutive companies sorted by latest-year revenue) -- lets each group use a linear
 * Y-axis without one giant company flattening everyone else, and without a log scale
 * visually compressing genuinely large size differences into looking similar. Adapts
 * automatically as competitor figures are updated, rather than a hand-maintained threshold.
 *
 * Kept in a plain (non "use client") module deliberately: a Server Component needs to call
 * this directly, and any exported function from a "use client" file gets treated as
 * client-only by Next.js -- calling it server-side throws even though this function has no
 * actual browser dependency.
 */
export function splitByTurnoverGap(financials: CompetitorFinancials[]): {
  high: CompetitorFinancials[];
  low: CompetitorFinancials[];
} {
  if (financials.length <= 1) return { high: financials, low: [] };

  const sorted = [...financials].sort((a, b) => latestRevenue(b) - latestRevenue(a));
  let splitIndex = 1;
  let biggestGapRatio = 0;
  for (let i = 1; i < sorted.length; i++) {
    const ratio = latestRevenue(sorted[i - 1]) / latestRevenue(sorted[i]);
    if (ratio > biggestGapRatio) {
      biggestGapRatio = ratio;
      splitIndex = i;
    }
  }

  return { high: sorted.slice(0, splitIndex), low: sorted.slice(splitIndex) };
}
