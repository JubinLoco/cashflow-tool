"use client";

import { useMemo, useState } from "react";
import { competitorColorFor, STATUS_COLOR, UNKNOWN_TIER_COLOR } from "@/lib/territories/color";
import { useColorScheme } from "@/lib/territories/useColorScheme";

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

const WIDTH = 760;
const HEIGHT = 320;
const MARGIN = { top: 16, right: 16, bottom: 32, left: 56 };
const PLOT_W = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_H = HEIGHT - MARGIN.top - MARGIN.bottom;
const Y_TICKS = 4;

function formatSEK(n: number) {
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B SEK`;
  return `${Math.round(n / 1_000_000)}M SEK`;
}

function formatAxisValue(v: number) {
  return v >= 1_000_000_000 ? `${(v / 1_000_000_000).toFixed(1)}B` : `${Math.round(v / 1_000_000)}M`;
}

export default function CompetitorFinancialsChart({ financials }: { financials: CompetitorFinancials[] }) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const mode = useColorScheme();

  const allYears = useMemo(
    () => [...new Set(financials.flatMap((c) => c.years.map((y) => y.year)))].sort((a, b) => a - b),
    [financials],
  );
  const maxRevenue = Math.max(...financials.flatMap((c) => c.years.map((y) => y.revenueSEK))) * 1.1;

  const xFor = (year: number) => MARGIN.left + ((year - allYears[0]) / (allYears[allYears.length - 1] - allYears[0])) * PLOT_W;
  const yFor = (revenue: number) => MARGIN.top + PLOT_H - (revenue / maxRevenue) * PLOT_H;

  const yGridValues = Array.from({ length: Y_TICKS + 1 }, (_, i) => (maxRevenue / Y_TICKS) * i);

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto" role="img" aria-label="Competitor turnover comparison over time">
        {yGridValues.map((v, i) => (
          <g key={i}>
            <line
              x1={MARGIN.left}
              x2={WIDTH - MARGIN.right}
              y1={yFor(v)}
              y2={yFor(v)}
              stroke="var(--map-border)"
              strokeWidth={1}
            />
            <text x={MARGIN.left - 6} y={yFor(v)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="var(--text-secondary)">
              {formatAxisValue(v)}
            </text>
          </g>
        ))}
        {allYears.map((year) => (
          <text
            key={year}
            x={xFor(year)}
            y={HEIGHT - MARGIN.bottom + 16}
            textAnchor="middle"
            fontSize={10}
            fill="var(--text-secondary)"
          >
            {year}
          </text>
        ))}

        {financials.map((c) => {
          const isHovered = hoveredId === c.id;
          const isDseg = Boolean(c.isPlayer);
          const isFallen = c.displayName.includes("(fallen)");
          const color = competitorColorFor(c.id, mode);
          const opacity = isDseg || isHovered ? 1 : hoveredId ? 0.2 : 0.8;
          const years = [...c.years].sort((a, b) => a.year - b.year);

          const segments: { from: YearFigure; to: YearFigure; isGap: boolean }[] = [];
          for (let i = 0; i < years.length - 1; i++) {
            const isGap = years[i + 1].year - years[i].year > 1;
            segments.push({ from: years[i], to: years[i + 1], isGap });
          }

          return (
            <g
              key={c.id}
              onMouseEnter={() => setHoveredId(c.id)}
              onMouseLeave={() => setHoveredId((h) => (h === c.id ? null : h))}
              style={{ cursor: "pointer" }}
            >
              {segments.map((seg, i) => (
                <line
                  key={i}
                  x1={xFor(seg.from.year)}
                  y1={yFor(seg.from.revenueSEK)}
                  x2={xFor(seg.to.year)}
                  y2={yFor(seg.to.revenueSEK)}
                  stroke={color}
                  strokeWidth={isDseg || isHovered ? 2.5 : 1.5}
                  strokeDasharray={seg.isGap || isFallen ? "5,4" : undefined}
                  opacity={opacity}
                />
              ))}
              {years.map((y) => {
                const profitColor =
                  y.profitSEK == null ? UNKNOWN_TIER_COLOR : y.profitSEK >= 0 ? STATUS_COLOR.active : "#d03b3b";
                return (
                  <circle
                    key={y.year}
                    cx={xFor(y.year)}
                    cy={yFor(y.revenueSEK)}
                    r={isDseg ? 4.5 : 3.5}
                    fill={profitColor}
                    stroke="var(--panel-surface)"
                    strokeWidth={1}
                    opacity={opacity}
                  >
                    <title>
                      {`${c.displayName} ${y.year}${y.isPartial ? " (partial year)" : ""}: ${formatSEK(y.revenueSEK)} revenue, ${
                        y.profitSEK == null ? "profit unknown" : `${formatSEK(y.profitSEK)} profit`
                      } — ${y.confidence}`}
                    </title>
                  </circle>
                );
              })}
            </g>
          );
        })}
      </svg>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
        {financials.map((c) => {
          const isHovered = hoveredId === c.id;
          const isDseg = Boolean(c.isPlayer);
          const color = competitorColorFor(c.id, mode);
          return (
            <button
              key={c.id}
              onMouseEnter={() => setHoveredId(c.id)}
              onMouseLeave={() => setHoveredId((h) => (h === c.id ? null : h))}
              className="flex items-center gap-1.5 text-xs"
              style={{ color: "var(--text-primary)", fontWeight: isDseg || isHovered ? 600 : 400 }}
            >
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: color }} />
              {c.displayName}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-4 text-xs text-[var(--text-secondary)]">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: STATUS_COLOR.active }} /> Profit
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: "#d03b3b" }} /> Loss
        </span>
        <span>Dashed segments = a gap year with no figure found, or a fallen competitor. Hover a name or line to highlight it.</span>
      </div>
    </div>
  );
}
