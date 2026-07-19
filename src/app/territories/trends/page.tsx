import MarketSizeChart from "@/components/territories/charts/MarketSizeChart";
import CompetitorFinancialsChart from "@/components/territories/charts/CompetitorFinancialsChart";
import marketSizeMonthly from "@/data/territories/market-size-monthly.json";
import competitorFinancials from "@/data/territories/competitor-financials.json";

export default function TerritoriesTrendsPage() {
  return (
    <div className="max-w-5xl mx-auto w-full px-6 py-8 space-y-10">
      <header>
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Trends</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-2">
          Market growth and competitor financial trajectories over the last several years.
        </p>
      </header>

      <section>
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Market size over the years</h2>
        <p className="text-xs text-[var(--text-secondary)] mb-3">
          Monthly new installations claiming the green-tech tax deduction, from Skatteverket data (Jan 2022 – Jun
          2026).
        </p>
        <MarketSizeChart data={marketSizeMonthly} />
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Competitor turnover &amp; profit</h2>
        <p className="text-xs text-[var(--text-secondary)] mb-3">
          Compiled from public filings and press coverage found during competitor research. Data is genuinely
          sparse for several competitors — missing years mean no reliable figure was found, not zero. Hover a bar
          for the source confidence behind each figure.
        </p>
        <CompetitorFinancialsChart financials={competitorFinancials} />
      </section>
    </div>
  );
}
