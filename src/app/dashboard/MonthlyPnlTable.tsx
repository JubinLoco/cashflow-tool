"use client";

import { Fragment } from "react";
import { formatSEK } from "@/lib/format";

type PnlFigures = { turnover: number; cogs: number; grossProfit: number; opex: number; companyProfit: number };
type MonthlyPnlRow = {
  month: string;
  real: PnlFigures;
  budget: PnlFigures;
  realEquity: number | null;
  budgetEquity: number | null;
  soliditet: number | null;
  kassalikviditet: number | null;
  avkastningPaTotaltKapital: number | null;
  kapitaletsOmsattningshastighet: number | null;
};

type Direction = "up" | "down";

const LINES: { key: keyof PnlFigures; label: string; direction: Direction }[] = [
  { key: "turnover", label: "Turnover", direction: "up" },
  { key: "cogs", label: "COGS", direction: "down" },
  { key: "grossProfit", label: "Gross profit", direction: "up" },
  { key: "opex", label: "Opex", direction: "down" },
  { key: "companyProfit", label: "Company profit", direction: "up" },
];

// Real/actual only, no forecast equivalent — Budget column always shows "—" for these.
// English names for the Swedish ratio terms (Soliditet, Kassalikviditet, Avkastning på
// totalt kapital, Kapitalets omsättningshastighet) — see monthlyPnl.ts for the formulas.
const RATIO_LINES: {
  key: "soliditet" | "kassalikviditet" | "avkastningPaTotaltKapital" | "kapitaletsOmsattningshastighet";
  label: string;
  direction: Direction;
}[] = [
  { key: "soliditet", label: "Equity ratio", direction: "up" },
  { key: "kassalikviditet", label: "Quick ratio", direction: "up" },
  { key: "avkastningPaTotaltKapital", label: "Return on assets", direction: "up" },
  { key: "kapitaletsOmsattningshastighet", label: "Asset turnover", direction: "up" },
];

function formatPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

// Indicates which direction is the healthy one for a given line — not "this value is
// good/bad" (both arrows mark the ideal direction for their own metric, e.g. COGS trending
// down is just as desirable as Turnover trending up).
function DirectionArrow({ direction }: { direction: Direction }) {
  return (
    <span
      title={direction === "up" ? "Higher is better" : "Lower is better"}
      style={{ color: "var(--text-secondary)" }}
    >
      {direction === "up" ? "↑" : "↓"}
    </span>
  );
}

export default function MonthlyPnlTable({ data }: { data: MonthlyPnlRow[] }) {
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
              <th className="py-2 px-3">Line</th>
              {data.map((row) => (
                <th key={row.month} className="py-2 px-3 text-center border-l" colSpan={2} style={{ borderColor: "var(--gridline)" }}>
                  {row.month}
                </th>
              ))}
            </tr>
            <tr className="text-left border-b" style={{ borderColor: "var(--gridline)" }}>
              <th className="py-2 px-3" />
              {data.map((row) => (
                <Fragment key={row.month}>
                  <th className="py-2 px-3 border-l" style={{ borderColor: "var(--gridline)" }}>
                    Real
                  </th>
                  <th className="py-2 px-3">Budget</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {LINES.map((line) => (
              <tr key={line.key} className="border-b" style={{ borderColor: "var(--gridline)" }}>
                <td className="py-2 px-3 font-medium" style={{ color: "var(--text-primary)" }}>
                  {line.label} <DirectionArrow direction={line.direction} />
                </td>
                {data.map((row) => (
                  <Fragment key={row.month}>
                    <td className="py-2 px-3 border-l" style={{ borderColor: "var(--gridline)" }}>
                      {formatSEK(row.real[line.key])}
                    </td>
                    <td className="py-2 px-3">{formatSEK(row.budget[line.key])}</td>
                  </Fragment>
                ))}
              </tr>
            ))}
            <tr className="border-b" style={{ borderColor: "var(--gridline)" }}>
              <td className="py-2 px-3 font-medium" style={{ color: "var(--text-primary)" }}>
                Equity <DirectionArrow direction="up" />
              </td>
              {data.map((row) => (
                <Fragment key={row.month}>
                  <td className="py-2 px-3 border-l" style={{ borderColor: "var(--gridline)" }}>
                    {row.realEquity != null ? (
                      formatSEK(row.realEquity)
                    ) : (
                      <span style={{ color: "var(--muted)" }}>—</span>
                    )}
                  </td>
                  <td className="py-2 px-3">
                    {row.budgetEquity != null ? (
                      formatSEK(row.budgetEquity)
                    ) : (
                      <span style={{ color: "var(--muted)" }}>—</span>
                    )}
                  </td>
                </Fragment>
              ))}
            </tr>
            {RATIO_LINES.map((line) => (
              <tr key={line.key} className="border-b" style={{ borderColor: "var(--gridline)" }}>
                <td className="py-2 px-3 font-medium" style={{ color: "var(--text-primary)" }}>
                  {line.label} <DirectionArrow direction={line.direction} />
                </td>
                {data.map((row) => (
                  <Fragment key={row.month}>
                    <td className="py-2 px-3 border-l" style={{ borderColor: "var(--gridline)" }}>
                      {row[line.key] != null ? formatPct(row[line.key]!) : <span style={{ color: "var(--muted)" }}>—</span>}
                    </td>
                    <td className="py-2 px-3">
                      <span style={{ color: "var(--muted)" }}>—</span>
                    </td>
                  </Fragment>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
