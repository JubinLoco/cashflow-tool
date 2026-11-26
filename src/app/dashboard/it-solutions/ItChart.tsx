"use client";

import { useState } from "react";
import { formatSEK } from "@/lib/format";

// One mark series: what the legend/tooltip call it and the CSS colour its segment gets.
export type Series = { key: string; label: string; color: string };

export type ChartPeriod = {
  key: string; // "2026-10" or "2026"
  label: string; // axis label
  groupLabel: string | null; // second axis row (the year, shown at the first period of each year)
  cost: number;
  costParts: Record<string, number>; // by cost series key (a single entry when there is no split)
  revenue: number;
  revenueParts: Record<string, number>; // by revenue series key
  recoveredPct: number | null;
};

const WIDTH = 960;
const HEIGHT = 300;
const PAD_LEFT = 56;
const PAD_RIGHT = 16;
const PAD_TOP = 24;
const PAD_BOTTOM = 44;
const BAR_MAX = 24;
const GAP = 2; // surface gap between touching marks

function compact(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${+(n / 1_000).toFixed(0)}k`;
  return `${Math.round(n)}`;
}

function niceMax(v: number): { max: number; step: number } {
  if (v <= 0) return { max: 1, step: 1 };
  const rough = v / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / pow;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * pow;
  return { max: Math.ceil(v / step) * step, step };
}

// A column anchored on the baseline: 4px rounded data-end (top), square at the baseline.
function topRounded(x: number, y: number, w: number, h: number, r = 4): string {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

type Seg = { key: string; y: number; h: number; top: boolean };

// Stack the series bottom-up into segments, with a 2px surface gap between neighbours.
function stack(series: Series[], parts: Record<string, number>, y: (v: number) => number): Seg[] {
  const active = series.filter((s) => (parts[s.key] ?? 0) > 0);
  const segs: Seg[] = [];
  let acc = 0;
  active.forEach((s, idx) => {
    const v = parts[s.key] ?? 0;
    const bottom = y(acc);
    const h = Math.max(1, bottom - y(acc + v) - (idx > 0 ? GAP : 0));
    segs.push({ key: s.key, y: bottom - h, h, top: idx === active.length - 1 });
    acc += v;
  });
  return segs;
}

export default function ItChart({
  periods,
  costSeries,
  revenueSeries,
  title,
}: {
  periods: ChartPeriod[];
  costSeries: Series[];
  revenueSeries: Series[];
  title: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const plotW = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const baseY = HEIGHT - PAD_BOTTOM;
  const peak = Math.max(1, ...periods.flatMap((p) => [p.cost, p.revenue]));
  const { max, step } = niceMax(peak);
  const y = (v: number) => baseY - (v / max) * plotH;

  const slotW = plotW / Math.max(periods.length, 1);
  const barW = Math.max(3, Math.min(BAR_MAX, slotW / 2 - 3));
  const ticks: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) ticks.push(v);

  // Selective direct label: the most recent period that has cost booked.
  let labelIdx = -1;
  periods.forEach((p, i) => {
    if (p.cost > 0) labelIdx = i;
  });

  const colorOf = new Map([...costSeries, ...revenueSeries].map((s) => [s.key, s.color]));
  const hovered = hover != null ? periods[hover] : null;
  const tipLeftPct = hover != null ? ((PAD_LEFT + (hover + 0.5) * slotW) / WIDTH) * 100 : 0;
  const flip = hover != null && hover > periods.length / 2;

  return (
    <div className="viz-root it-chart">
      <style>{`
        .it-chart {
          color-scheme: light;
          --surface-1: #fcfcfb;
          --text-primary: #0b0b0b;
          --text-secondary: #52514e;
          --muted: #898781;
          --gridline: #e1e0d9;
          --baseline: #c3c2b7;
          --series-1: #2a78d6;
          --series-2: #eb6834;
          --series-3: #1baf7a;
          --series-4: #eda100;
          --series-5: #e87ba4;
          --series-6: #008300;
          --series-7: #6250d6;
          --series-8: #e34948;
        }
        @media (prefers-color-scheme: dark) {
          :root:where(:not([data-theme="light"])) .it-chart {
            color-scheme: dark;
            --surface-1: #1a1a19;
            --text-primary: #f0efec;
            --text-secondary: #c3c2b7;
            --gridline: #2c2c2a;
            --baseline: #383835;
            --series-1: #3987e5;
            --series-2: #d95926;
            --series-3: #199e70;
            --series-4: #c98500;
            --series-5: #d55181;
            --series-6: #0ca30c;
            --series-7: #9085e9;
            --series-8: #e66767;
          }
        }
        :root[data-theme="dark"] .it-chart {
          color-scheme: dark;
          --surface-1: #1a1a19;
          --text-primary: #f0efec;
          --text-secondary: #c3c2b7;
          --gridline: #2c2c2a;
          --baseline: #383835;
          --series-1: #3987e5;
          --series-2: #d95926;
          --series-3: #199e70;
          --series-4: #c98500;
          --series-5: #d55181;
          --series-6: #0ca30c;
          --series-7: #9085e9;
          --series-8: #e66767;
        }
        .it-chart .hit:focus { outline: none; }
        .it-chart .hit:focus-visible { outline: 2px solid var(--text-secondary); outline-offset: -2px; }
      `}</style>

      <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
        {title}
      </h3>

      {/* Legend: one group per column (cost on the left of each pair, recovered on the right). */}
      <div className="flex flex-wrap gap-x-8 gap-y-1 mb-2 text-xs" style={{ color: "var(--text-secondary)" }}>
        {[
          { name: "Cost", series: costSeries },
          { name: "Recovered", series: revenueSeries },
        ].map((g) => (
          <div key={g.name} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span style={{ color: "var(--muted)" }}>{g.name}</span>
            {g.series.map((s) => (
              <span key={s.key} className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
                {s.label}
              </span>
            ))}
          </div>
        ))}
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full h-auto"
          style={{ background: "var(--surface-1)" }}
          role="img"
          aria-label={`${title}. Cost and recovered revenue per period; the table below has every value.`}
        >
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={y(v)} y2={y(v)} stroke="var(--gridline)" strokeWidth={1} />
              <text x={PAD_LEFT - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">
                {compact(v)}
              </text>
            </g>
          ))}
          <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={baseY} y2={baseY} stroke="var(--baseline)" strokeWidth={1} />

          {periods.map((p, i) => {
            const cx = PAD_LEFT + (i + 0.5) * slotW;
            const costX = cx - barW - GAP / 2;
            const revX = cx + GAP / 2;
            const dim = hover != null && hover !== i ? 0.45 : 1;
            const costSegs = stack(costSeries, p.costParts, y);
            const revSegs = stack(revenueSeries, p.revenueParts, y);

            const draw = (segs: Seg[], x: number) =>
              segs.map((s) =>
                s.top ? (
                  <path key={s.key} d={topRounded(x, s.y, barW, s.h)} fill={colorOf.get(s.key)} />
                ) : (
                  <rect key={s.key} x={x} y={s.y} width={barW} height={s.h} fill={colorOf.get(s.key)} />
                ),
              );

            return (
              <g key={p.key} opacity={dim}>
                {draw(costSegs, costX)}
                {draw(revSegs, revX)}

                {i === labelIdx && (
                  <>
                    <text x={costX + barW / 2} y={y(p.cost) - 6} textAnchor="middle" fontSize={11} fill="var(--text-secondary)">
                      {compact(p.cost)}
                    </text>
                    {p.revenue > 0 && (
                      <text x={revX + barW / 2} y={y(p.revenue) - 6} textAnchor="middle" fontSize={11} fill="var(--text-secondary)">
                        {compact(p.revenue)}
                      </text>
                    )}
                  </>
                )}

                <text x={cx} y={baseY + 16} textAnchor="middle" fontSize={10} fill="var(--muted)">
                  {p.label}
                </text>
                {p.groupLabel && (
                  <text x={cx} y={baseY + 31} textAnchor="middle" fontSize={10} fill="var(--text-secondary)">
                    {p.groupLabel}
                  </text>
                )}
              </g>
            );
          })}

          {/* Hit targets: the whole column band, much bigger than the marks themselves. */}
          {periods.map((p, i) => (
            <rect
              key={p.key}
              className="hit"
              x={PAD_LEFT + i * slotW}
              y={PAD_TOP - 8}
              width={slotW}
              height={plotH + 8}
              fill="transparent"
              tabIndex={0}
              aria-label={`${p.label}${p.groupLabel ? " " + p.groupLabel : ""}: cost ${formatSEK(p.cost)}, recovered ${formatSEK(p.revenue)}`}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover((h) => (h === i ? null : h))}
              onFocus={() => setHover(i)}
              onBlur={() => setHover((h) => (h === i ? null : h))}
            />
          ))}
        </svg>

        {hovered && (
          <div
            className="absolute pointer-events-none text-xs rounded-md px-3 py-2 shadow-md"
            style={{
              top: 8,
              left: `${tipLeftPct}%`,
              transform: flip ? "translateX(calc(-100% - 12px))" : "translateX(12px)",
              background: "var(--surface-1)",
              border: "1px solid var(--gridline)",
              color: "var(--text-secondary)",
              minWidth: 210,
              zIndex: 10,
            }}
          >
            <div className="mb-1" style={{ color: "var(--text-primary)", fontWeight: 600 }}>
              {hovered.key}
            </div>
            <TipTotal label="Cost" value={formatSEK(hovered.cost)} />
            {costSeries.length > 1 &&
              costSeries.map((s) => <TipRow key={s.key} color={s.color} name={s.label} value={hovered.costParts[s.key] ?? 0} />)}
            <div className="mt-1.5" />
            <TipTotal
              label="Recovered"
              value={`${formatSEK(hovered.revenue)}${hovered.recoveredPct != null ? ` (${(hovered.recoveredPct * 100).toFixed(1)}%)` : ""}`}
            />
            {revenueSeries.length > 1 &&
              revenueSeries.map((s) => <TipRow key={s.key} color={s.color} name={s.label} value={hovered.revenueParts[s.key] ?? 0} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function TipTotal({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-6">
      <span>{label}</span>
      <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function TipRow({ color, name, value }: { color: string; name: string; value: number }) {
  if (value === 0) return null;
  return (
    <div className="flex items-center justify-between gap-6 pl-2">
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-3 h-0.5" style={{ background: color }} />
        {name}
      </span>
      <span style={{ color: "var(--text-primary)" }}>{formatSEK(value)}</span>
    </div>
  );
}
