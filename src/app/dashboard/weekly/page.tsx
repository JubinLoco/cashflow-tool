"use client";

import { useEffect, useState } from "react";
import WeeklyByLineTable from "../WeeklyByLineTable";

type WeeklyPoint = { week: string; forecast: number; forecastProfit: number; real: number; grossProfit: number; marginPct: number };
type WeeklyByLineData = { businessLine: string; weeks: WeeklyPoint[] };

export default function WeeklyByLinePage() {
  const [weeklyByLine, setWeeklyByLine] = useState<WeeklyByLineData[]>([]);

  useEffect(() => {
    fetch("/api/dashboard/weekly-by-line")
      .then((r) => r.json())
      .then(setWeeklyByLine);
  }, []);

  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">Weekly by business line</h2>
      {weeklyByLine.length > 0 ? <WeeklyByLineTable data={weeklyByLine} /> : <p>Loading…</p>}
    </section>
  );
}
