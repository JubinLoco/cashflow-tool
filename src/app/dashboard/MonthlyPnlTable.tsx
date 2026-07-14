"use client";

import { Fragment } from "react";
import { formatSEK } from "@/lib/format";

type PnlFigures = { turnover: number; cogs: number; grossProfit: number; opex: number; companyProfit: number };
type MonthlyPnlRow = { month: string; real: PnlFigures; budget: PnlFigures; equity: number };

const LINES: { key: keyof PnlFigures; label: string }[] = [
  { key: "turnover", label: "Turnover" },
  { key: "cogs", label: "COGS" },
  { key: "grossProfit", label: "Gross profit" },
  { key: "opex", label: "Opex" },
  { key: "companyProfit", label: "Company profit" },
];

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
                  {line.label}
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
                Equity
              </td>
              {data.map((row) => (
                <Fragment key={row.month}>
                  <td className="py-2 px-3 border-l" style={{ borderColor: "var(--gridline)" }}>
                    {formatSEK(row.equity)}
                  </td>
                  <td className="py-2 px-3 text-center" style={{ color: "var(--muted)" }}>
                    —
                  </td>
                </Fragment>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
