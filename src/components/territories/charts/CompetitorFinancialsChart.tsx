"use client";

import { useMemo, useState } from "react";
import { competitorColorFor, STATUS_COLOR, UNKNOWN_TIER_COLOR } from "@/lib/territories/color";
import { useColorScheme } from "@/lib/territories/useColorScheme";

type YearFigure = {
  year: number;
  revenueSEK: number;
  profitSEK: number | null;
  confidence: string;
  isPartial?: boolean;
};

type CompetitorFinancials = {
  id: string;
  displayName: string;
  isPlayer?: boolean;
  years: YearFigure[];
};

const WIDTH = 760;
const HEIGHT = 380;
const MARGIN = { top: 16, right: 16, bottom: 32, left: 56 };
const PLOT_W = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_H = HEIGHT - MARGIN.top - MARGIN.bottom;

function formatSEK(n: number) {
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B SEK`;
  return `${Math.round(n / 1_000_000)}M SEK`;
}

export default function CompetitorFinancialsChart({ financials }: { financials: CompetitorFinancials[] }) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const mode = useColorScheme();

  const allYears = useMemo(
    () => [...new Set(financials.flatMap((c) => c.years.map((y) => y.year)))].sort((a, b) => a - b),
    [financials],
  );
  const allRevenues = financials.flatMap((c) => c.years.map((y) => y.revenueSEK));
  const logMin = Math.floor(Math.log10(Math.min(...allRevenues)) * 2) / 2 - 0.25;
  const logMax = Math.ceil(Math.log10(Math.max(...allRevenues)) * 2) / 2 + 0.25;

  const xFor = (year: number) => MARGIN.left + ((year - allYears[0]) / (allYears[allYears.length - 1] - allYears[0])) * PLOT_W;
  const yFor = (revenue: number) => MARGIN.top + PLOT_H - ((Math.log10(revenue) - logMin) / (logMax - logMin)) * PLOT_H;

  const yGridSteps = useMemo(() => {
    const steps: number[] = [];
    for (let exp = Math.ceil(logMin); exp <= Math.floor(logMax); exp++) steps.push(10 ** exp);
    return steps;
  }, [logMin, logMax]);

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto" role="img" aria-label="Competitor turnover comparison over time">
        {yGridSteps.map((v) => (
          <g key={v}>
            <line
              x1={MARGIN.left}
              x2={WIDTH - MARGIN.right}
              y1={yFor(v)}
              y2={yFor(v)}
              stroke="var(--map-border)"
              strokeWidth={1}
            />
            <text x={MARGIN.left - 6} y={yFor(v)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="var(--text-secondary)">
              {v >= 1_000_000_000 ? `${v / 1_000_000_000}B` : `${v / 1_000_000}M`}
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
        <span>
          Y-axis is log-scaled (revenue spans ~3 orders of magnitude). Dashed segments = a gap year with no figure
          found, or a fallen competitor. Hover a name or line to highlight it.
        </span>
      </div>
    </div>
  );
}
