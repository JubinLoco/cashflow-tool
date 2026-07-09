"use client";

import { useMemo, useState } from "react";
import { formatSEK } from "@/lib/format";

type MonthlyComparison = { month: string; forecast: number; actual: number };

const WIDTH = 800;
const HEIGHT = 260;
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

export default function ComparisonChart({ title, data }: { title: string; data: MonthlyComparison[] }) {
  const [showTable, setShowTable] = useState(false);

  const maxY = useMemo(() => Math.max(1, ...data.flatMap((d) => [d.forecast, d.actual])), [data]);
  const yScale = (v: number) => HEIGHT - PAD_BOTTOM - (v / maxY) * (HEIGHT - PAD_TOP - PAD_BOTTOM);

  const groupWidth = (WIDTH - PAD_LEFT - PAD_RIGHT) / Math.max(data.length, 1);
  const barWidth = Math.min(24, groupWidth / 2 - 4);

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
          --series-2: #1baf7a;
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
            --series-2: #199e70;
          }
        }
      `}</style>

      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {title}
        </h3>
        <button className="text-xs underline" style={{ color: "var(--text-secondary)" }} onClick={() => setShowTable((s) => !s)}>
          {showTable ? "Show chart" : "Show table"}
        </button>
      </div>

      <div className="flex gap-4 mb-2 text-xs" style={{ color: "var(--text-secondary)" }}>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "var(--series-1)" }} /> Forecast
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "var(--series-2)" }} /> Actual
        </span>
      </div>

      {showTable ? (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b" style={{ borderColor: "var(--gridline)" }}>
              <th className="py-2 px-3">Month</th>
              <th className="py-2 px-3">Forecast</th>
              <th className="py-2 px-3">Actual</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.month} className="border-b" style={{ borderColor: "var(--gridline)" }}>
                <td className="py-2 px-3">{d.month}</td>
                <td className="py-2 px-3">{formatSEK(d.forecast)}</td>
                <td className="py-2 px-3">{formatSEK(d.actual)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto" style={{ background: "var(--surface-1)" }}>
          {[0, maxY / 2, maxY].map((v, i) => (
            <g key={i}>
              <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={yScale(v)} y2={yScale(v)} stroke="var(--gridline)" strokeWidth={1} />
              <text x={PAD_LEFT - 8} y={yScale(v) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">
                {compactSEK(v)}
              </text>
            </g>
          ))}
          <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={HEIGHT - PAD_BOTTOM} y2={HEIGHT - PAD_BOTTOM} stroke="var(--baseline)" strokeWidth={1} />

          {data.map((d, i) => {
            const groupX = PAD_LEFT + i * groupWidth;
            const gap = 2;
            return (
              <g key={d.month}>
                <rect
                  x={groupX + groupWidth / 2 - barWidth - gap / 2}
                  y={yScale(d.forecast)}
                  width={barWidth}
                  height={Math.max(0, HEIGHT - PAD_BOTTOM - yScale(d.forecast))}
                  fill="var(--series-1)"
                  rx={2}
                />
                <rect
                  x={groupX + groupWidth / 2 + gap / 2}
                  y={yScale(d.actual)}
                  width={barWidth}
                  height={Math.max(0, HEIGHT - PAD_BOTTOM - yScale(d.actual))}
                  fill="var(--series-2)"
                  rx={2}
                />
                <text x={groupX + groupWidth / 2} y={HEIGHT - PAD_BOTTOM + 16} textAnchor="middle" fontSize={10} fill="var(--muted)">
                  {d.month.slice(5)}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
