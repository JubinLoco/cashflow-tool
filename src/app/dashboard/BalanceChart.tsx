"use client";

import { useMemo, useRef, useState } from "react";

type LineItem = { amount: number; description: string };
type Point = {
  date: string;
  balance: number;
  level: string;
  inflow: number;
  outflow: number;
  inflowItems: LineItem[];
  outflowItems: LineItem[];
};

function itemsDetail(items: LineItem[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0].description;
  return items.map((i) => `${i.description} (${i.amount.toLocaleString()})`).join("; ");
}
type Thresholds = { taxBuffer: number; warning: number; bankruptcy: number };

const WIDTH = 800;
const HEIGHT = 320;
const PAD_LEFT = 64;
const PAD_RIGHT = 16;
const PAD_TOP = 16;
const PAD_BOTTOM = 32;

function compactSEK(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)}k`;
  return `${sign}${abs.toFixed(0)}`;
}

export default function BalanceChart({ points, thresholds }: { points: Point[]; thresholds: Thresholds }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const { minY, maxY, xScale, yScale } = useMemo(() => {
    const values = points.map((p) => p.balance).concat([thresholds.bankruptcy, thresholds.warning, thresholds.taxBuffer]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const spread = max - min || 1;
    const minYv = min - spread * 0.1;
    const maxYv = max + spread * 0.1;
    const xs = (i: number) => PAD_LEFT + (i / Math.max(points.length - 1, 1)) * (WIDTH - PAD_LEFT - PAD_RIGHT);
    const ys = (v: number) =>
      HEIGHT - PAD_BOTTOM - ((v - minYv) / (maxYv - minYv)) * (HEIGHT - PAD_TOP - PAD_BOTTOM);
    return { minY: minYv, maxY: maxYv, xScale: xs, yScale: ys };
  }, [points, thresholds]);

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(i)} ${yScale(p.balance)}`).join(" ");

  const thresholdLines = useMemo(() => {
    const MIN_GAP = 15;
    const lines = [
      { v: thresholds.taxBuffer, label: "Tax buffer", color: "var(--status-warning)" },
      { v: thresholds.warning, label: "Warning", color: "var(--status-serious)" },
      { v: thresholds.bankruptcy, label: "Bankruptcy", color: "var(--status-critical)" },
    ]
      .map((t) => ({ ...t, lineY: yScale(t.v), labelY: yScale(t.v) - 4 }))
      .sort((a, b) => a.labelY - b.labelY);

    for (let i = 1; i < lines.length; i++) {
      if (lines[i].labelY < lines[i - 1].labelY + MIN_GAP) {
        lines[i].labelY = lines[i - 1].labelY + MIN_GAP;
      }
    }
    return lines;
  }, [thresholds, yScale]);

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const ratio = (x - PAD_LEFT) / (WIDTH - PAD_LEFT - PAD_RIGHT);
    const idx = Math.round(ratio * (points.length - 1));
    setHoverIndex(Math.max(0, Math.min(points.length - 1, idx)));
  }

  const tickIndices = points.length <= 8 ? points.map((_, i) => i) : [0, Math.floor((points.length - 1) / 2), points.length - 1];
  const hovered = hoverIndex !== null ? points[hoverIndex] : null;
  const last = points[points.length - 1];

  return (
    <div className="viz-root">
      <style>{`
        .viz-root {
          --surface-1: #fcfcfb;
          --text-primary: #0b0b0b;
          --text-secondary: #52514e;
          --muted: #898781;
          --gridline: #e1e0d9;
          --baseline: #c3c2b7;
          --series-1: #2a78d6;
          --status-warning: #fab219;
          --status-serious: #ec835a;
          --status-critical: #d03b3b;
        }
        @media (prefers-color-scheme: dark) {
          .viz-root {
            --surface-1: #1a1a19;
            --text-primary: #ffffff;
            --text-secondary: #c3c2b7;
            --muted: #898781;
            --gridline: #2c2c2a;
            --baseline: #383835;
            --series-1: #3987e5;
          }
        }
      `}</style>

      <div className="flex justify-between items-center mb-2">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Projected balance: <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{compactSEK(last.balance)} SEK</span>
        </p>
        <button className="text-xs underline" style={{ color: "var(--text-secondary)" }} onClick={() => setShowTable((s) => !s)}>
          {showTable ? "Show chart" : "Show table"}
        </button>
      </div>

      {showTable ? (
        <div className="max-h-80 overflow-y-auto text-sm">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left border-b" style={{ borderColor: "var(--gridline)" }}>
                <th className="py-1">Date</th>
                <th className="py-1">Cash in</th>
                <th className="py-1">Detail</th>
                <th className="py-1">Cash out</th>
                <th className="py-1">Detail</th>
                <th className="py-1">Balance</th>
                <th className="py-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.date} className="border-b" style={{ borderColor: "var(--gridline)" }}>
                  <td className="py-1 whitespace-nowrap">{p.date}</td>
                  <td className="py-1">{p.inflow ? p.inflow.toLocaleString() : ""}</td>
                  <td className="py-1" style={{ color: "var(--text-secondary)" }}>
                    {itemsDetail(p.inflowItems)}
                  </td>
                  <td className="py-1">{p.outflow ? p.outflow.toLocaleString() : ""}</td>
                  <td className="py-1" style={{ color: "var(--text-secondary)" }}>
                    {itemsDetail(p.outflowItems)}
                  </td>
                  <td className="py-1">{p.balance.toLocaleString()}</td>
                  <td className="py-1">{p.level}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="w-full h-auto"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoverIndex(null)}
            style={{ background: "var(--surface-1)" }}
          >
            {/* Danger zone bands */}
            {maxY > thresholds.bankruptcy && (
              <rect
                x={PAD_LEFT}
                y={yScale(Math.min(thresholds.bankruptcy, maxY))}
                width={WIDTH - PAD_LEFT - PAD_RIGHT}
                height={Math.max(0, yScale(minY) - yScale(thresholds.bankruptcy))}
                fill="var(--status-critical)"
                opacity={0.1}
              />
            )}
            <rect
              x={PAD_LEFT}
              y={yScale(Math.min(thresholds.warning, maxY))}
              width={WIDTH - PAD_LEFT - PAD_RIGHT}
              height={Math.max(0, yScale(thresholds.bankruptcy) - yScale(thresholds.warning))}
              fill="var(--status-serious)"
              opacity={0.1}
            />
            <rect
              x={PAD_LEFT}
              y={yScale(Math.min(thresholds.taxBuffer, maxY))}
              width={WIDTH - PAD_LEFT - PAD_RIGHT}
              height={Math.max(0, yScale(thresholds.warning) - yScale(thresholds.taxBuffer))}
              fill="var(--status-warning)"
              opacity={0.1}
            />

            {/* Gridlines + y ticks */}
            {[minY, (minY + maxY) / 2, maxY].map((v, i) => (
              <g key={i}>
                <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={yScale(v)} y2={yScale(v)} stroke="var(--gridline)" strokeWidth={1} />
                <text x={PAD_LEFT - 8} y={yScale(v) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">
                  {compactSEK(v)}
                </text>
              </g>
            ))}

            {/* Threshold reference lines */}
            {thresholdLines.map((t) => (
              <g key={t.label}>
                <line
                  x1={PAD_LEFT}
                  x2={WIDTH - PAD_RIGHT}
                  y1={t.lineY}
                  y2={t.lineY}
                  stroke={t.color}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                />
                <text x={WIDTH - PAD_RIGHT} y={t.labelY} textAnchor="end" fontSize={11} fill="var(--text-secondary)">
                  {t.label} ({compactSEK(t.v)})
                </text>
              </g>
            ))}

            {/* X axis ticks */}
            {tickIndices.map((i) => (
              <text key={i} x={xScale(i)} y={HEIGHT - PAD_BOTTOM + 16} textAnchor="middle" fontSize={11} fill="var(--muted)">
                {points[i].date}
              </text>
            ))}
            <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={HEIGHT - PAD_BOTTOM} y2={HEIGHT - PAD_BOTTOM} stroke="var(--baseline)" strokeWidth={1} />

            {/* Balance line */}
            <path d={linePath} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

            {/* End marker */}
            <circle cx={xScale(points.length - 1)} cy={yScale(last.balance)} r={4} fill="var(--series-1)" stroke="var(--surface-1)" strokeWidth={2} />

            {/* Hover crosshair */}
            {hovered && (
              <>
                <line
                  x1={xScale(hoverIndex!)}
                  x2={xScale(hoverIndex!)}
                  y1={PAD_TOP}
                  y2={HEIGHT - PAD_BOTTOM}
                  stroke="var(--baseline)"
                  strokeWidth={1}
                />
                <circle
                  cx={xScale(hoverIndex!)}
                  cy={yScale(hovered.balance)}
                  r={4}
                  fill="var(--series-1)"
                  stroke="var(--surface-1)"
                  strokeWidth={2}
                />
              </>
            )}
          </svg>

          {hovered && (
            <div
              className="absolute pointer-events-none text-xs rounded px-2 py-1 shadow"
              style={{
                left: `${(xScale(hoverIndex!) / WIDTH) * 100}%`,
                top: `${(yScale(hovered.balance) / HEIGHT) * 100}%`,
                transform: "translate(-50%, -130%)",
                background: "var(--surface-1)",
                color: "var(--text-primary)",
                border: "1px solid var(--gridline)",
                whiteSpace: "nowrap",
              }}
            >
              <div>{hovered.date}</div>
              <div style={{ fontWeight: 600 }}>{hovered.balance.toLocaleString()} SEK</div>
              <div style={{ color: "var(--text-secondary)" }}>{hovered.level}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
