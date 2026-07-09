"use client";

import { Fragment } from "react";
import { formatSEK } from "@/lib/format";

type WeeklyPoint = { week: string; forecast: number; real: number; grossProfit: number; marginPct: number };
type WeeklyByLine = { businessLine: string; weeks: WeeklyPoint[] };

const LINE_LABEL: Record<string, string> = {
  residential: "Residential",
  gmax_ci: "C&I / G-Max",
  consultancy: "Consultancy",
};

function formatPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export default function WeeklyByLineTable({ data }: { data: WeeklyByLine[] }) {
  const weeks = data[0]?.weeks.map((w) => w.week) ?? [];

  return (
    <div className="viz-root">
      <style>{`
        .viz-root {
          --surface-1: #fcfcfb;
          --text-primary: #0b0b0b;
          --text-secondary: #52514e;
          --muted: #898781;
          --gridline: #e1e0d9;
        }
        @media (prefers-color-scheme: dark) {
          .viz-root {
            --surface-1: #1a1a19;
            --text-primary: #ffffff;
            --text-secondary: #c3c2b7;
            --muted: #898781;
            --gridline: #2c2c2a;
          }
        }
      `}</style>

      <div className="overflow-x-auto">
        <table className="text-sm border-collapse" style={{ minWidth: "100%" }}>
          <thead>
            <tr className="text-left border-b" style={{ borderColor: "var(--gridline)" }}>
              <th className="py-2 px-3" rowSpan={2}>
                Week
              </th>
              {data.map((line) => (
                <th key={line.businessLine} className="py-2 px-3 text-center border-l" colSpan={4} style={{ borderColor: "var(--gridline)" }}>
                  {LINE_LABEL[line.businessLine] ?? line.businessLine}
                </th>
              ))}
            </tr>
            <tr className="text-left border-b" style={{ borderColor: "var(--gridline)" }}>
              {data.map((line) => (
                <Fragment key={line.businessLine}>
                  <th className="py-2 px-3 border-l" style={{ borderColor: "var(--gridline)" }}>
                    Forecast
                  </th>
                  <th className="py-2 px-3">Real</th>
                  <th className="py-2 px-3">Margin %</th>
                  <th className="py-2 px-3">Gross profit</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, i) => (
              <tr key={week} className="border-b" style={{ borderColor: "var(--gridline)" }}>
                <td className="py-2 px-3" style={{ color: "var(--text-primary)" }}>
                  {week}
                </td>
                {data.map((line) => {
                  const point = line.weeks[i];
                  return (
                    <Fragment key={line.businessLine}>
                      <td className="py-2 px-3 border-l" style={{ borderColor: "var(--gridline)" }}>
                        {formatSEK(point.forecast)}
                      </td>
                      <td className="py-2 px-3">{formatSEK(point.real)}</td>
                      <td className="py-2 px-3">{point.real === 0 ? "—" : formatPct(point.marginPct)}</td>
                      <td className="py-2 px-3">{point.real === 0 ? "—" : formatSEK(point.grossProfit)}</td>
                    </Fragment>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
