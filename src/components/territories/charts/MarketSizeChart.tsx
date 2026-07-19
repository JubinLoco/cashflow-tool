"use client";

import { useMemo, useRef, useState } from "react";
import { SEQUENTIAL_BLUE } from "@/lib/territories/color";

type MonthRow = {
  province: string;
  year: number;
  month: number;
  category: string;
  count: number;
};

const CATEGORIES = [
  { id: "solar", label: "Solar" },
  { id: "battery", label: "Battery" },
  { id: "ev_charger", label: "EV charger" },
] as const;

type CategoryId = (typeof CATEGORIES)[number]["id"];

const WIDTH = 780;
const HEIGHT = 280;
const MARGIN = { top: 12, right: 16, bottom: 24, left: 48 };
const PLOT_W = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_H = HEIGHT - MARGIN.top - MARGIN.bottom;

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function MarketSizeChart({ data }: { data: MonthRow[] }) {
  const [category, setCategory] = useState<CategoryId>("solar");
  const [province, setProvince] = useState<string>("__all__");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const provinces = useMemo(() => [...new Set(data.map((d) => d.province))].sort(), [data]);

  const months = useMemo(() => {
    const keys = [...new Set(data.map((d) => `${d.year}-${String(d.month).padStart(2, "0")}`))].sort();
    return keys.map((k) => {
      const [year, month] = k.split("-").map(Number);
      return { year, month, key: k };
    });
  }, [data]);

  const series = useMemo(
    () =>
      months.map((m) => {
        const rows = data.filter(
          (d) => d.year === m.year && d.month === m.month && d.category === category && (province === "__all__" || d.province === province),
        );
        return { ...m, value: rows.reduce((sum, r) => sum + r.count, 0) };
      }),
    [data, months, category, province],
  );

  const maxValue = Math.max(1, ...series.map((s) => s.value));
  const xFor = (i: number) => MARGIN.left + (i / (series.length - 1)) * PLOT_W;
  const yFor = (v: number) => MARGIN.top + PLOT_H - (v / maxValue) * PLOT_H;

  const linePath = series.map((s, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(s.value).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${xFor(series.length - 1).toFixed(1)} ${yFor(0).toFixed(1)} L ${xFor(0).toFixed(1)} ${yFor(0).toFixed(1)} Z`;

  const yTicks = 4;
  const yGridValues = Array.from({ length: yTicks + 1 }, (_, i) => Math.round((maxValue / yTicks) * i));

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = WIDTH / rect.width;
    const localX = (e.clientX - rect.left) * scaleX;
    const idx = Math.round(((localX - MARGIN.left) / PLOT_W) * (series.length - 1));
    setHoverIndex(Math.max(0, Math.min(series.length - 1, idx)));
  }

  const hovered = hoverIndex != null ? series[hoverIndex] : null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <div className="flex gap-1 rounded-lg border border-[var(--panel-border)] p-0.5">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                category === c.id ? "bg-[#2a78d6] text-white" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <select
          value={province}
          onChange={(e) => setProvince(e.target.value)}
          className="text-xs bg-transparent border border-[var(--panel-border)] rounded-md px-2 py-1 text-[var(--text-primary)]"
        >
          <option value="__all__">All provinces</option>
          {provinces.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-auto"
        role="img"
        aria-label="Monthly market size trend"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        {yGridValues.map((v, i) => (
          <g key={i}>
            <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={yFor(v)} y2={yFor(v)} stroke="var(--map-border)" strokeWidth={1} />
            <text x={MARGIN.left - 6} y={yFor(v)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="var(--text-secondary)">
              {v.toLocaleString("sv-SE")}
            </text>
          </g>
        ))}

        {series.map((s, i) => {
          if (s.month !== 1 && i !== 0) return null;
          return (
            <text key={s.key} x={xFor(i)} y={HEIGHT - MARGIN.bottom + 14} textAnchor="middle" fontSize={10} fill="var(--text-secondary)">
              {s.year}
            </text>
          );
        })}

        <path d={areaPath} fill={SEQUENTIAL_BLUE[1]} opacity={0.5} />
        <path d={linePath} fill="none" stroke={SEQUENTIAL_BLUE[5]} strokeWidth={2} />

        {hovered && (
          <g>
            <line
              x1={xFor(hoverIndex!)}
              x2={xFor(hoverIndex!)}
              y1={MARGIN.top}
              y2={HEIGHT - MARGIN.bottom}
              stroke="var(--text-secondary)"
              strokeWidth={1}
              strokeDasharray="3,3"
            />
            <circle cx={xFor(hoverIndex!)} cy={yFor(hovered.value)} r={4} fill={SEQUENTIAL_BLUE[5]} stroke="var(--panel-surface)" strokeWidth={1.5} />
          </g>
        )}
      </svg>

      <div className="mt-2 text-xs text-[var(--text-secondary)] h-4">
        {hovered
          ? `${MONTH_ABBR[hovered.month - 1]} ${hovered.year}: ${hovered.value.toLocaleString("sv-SE")} ${CATEGORIES.find((c) => c.id === category)?.label.toLowerCase()} installs`
          : "Hover the chart for the exact monthly count."}
      </div>
    </div>
  );
}
