"use client";

import { useEffect, useState } from "react";
import MonthlyPnlTable from "../MonthlyPnlTable";

type PnlFigures = { turnover: number; cogs: number; grossProfit: number; opex: number; companyProfit: number };
type MonthlyPnlRow = { month: string; real: PnlFigures; budget: PnlFigures; equity: number };

export default function MonthlyPnlPage() {
  const [monthlyPnl, setMonthlyPnl] = useState<MonthlyPnlRow[]>([]);

  useEffect(() => {
    fetch("/api/dashboard/monthly-pnl")
      .then((r) => r.json())
      .then(setMonthlyPnl);
  }, []);

  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">Monthly P&amp;L and equity</h2>
      {monthlyPnl.length > 0 ? <MonthlyPnlTable data={monthlyPnl} /> : <p>Loading…</p>}
    </section>
  );
}
