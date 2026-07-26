import MarketSizeChart from "@/components/territories/charts/MarketSizeChart";
import CompetitorFinancialsChart, { splitByTurnoverGap } from "@/components/territories/charts/CompetitorFinancialsChart";
import { readMarketSize } from "@/lib/territories/marketSize";
import competitorFinancials from "@/data/territories/competitor-financials.json";

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Ahlsell and Rexel are general electrical wholesalers reporting whole-company revenue
// (solar/EV/battery isn't broken out separately) -- their turnover isn't comparable to
// the rest of the solar-focused competitors here, so they're excluded from this chart
// entirely rather than just visually set aside. Still tracked as competitors everywhere
// else (map, roster, prospects).
const TURNOVER_CHART_EXCLUDED_IDS = new Set(["ahlsell", "rexel"]);

export default async function TerritoriesTrendsPage() {
  const { monthly } = await readMarketSize();
  const comparableCompetitors = competitorFinancials.filter((c) => !TURNOVER_CHART_EXCLUDED_IDS.has(c.id));
  const { high: largerCompetitors, low: smallerCompetitors } = splitByTurnoverGap(comparableCompetitors);
  const earliest = monthly.reduce((min, r) => (r.year * 12 + r.month < min.year * 12 + min.month ? r : min), monthly[0]);
  const latest = monthly.reduce((max, r) => (r.year * 12 + r.month > max.year * 12 + max.month ? r : max), monthly[0]);
  const rangeLabel = monthly.length
    ? `${MONTH_ABBR[earliest.month - 1]} ${earliest.year} – ${MONTH_ABBR[latest.month - 1]} ${latest.year}`
    : "no data uploaded yet";

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
          Monthly new installations claiming the green-tech tax deduction, from Skatteverket data ({rangeLabel}).
        </p>
        <MarketSizeChart data={monthly} />
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Competitor turnover &amp; profit</h2>
        <p className="text-xs text-[var(--text-secondary)] mb-3">
          Compiled from public filings and press coverage found during competitor research. Data is genuinely
          sparse for several competitors — missing years mean no reliable figure was found, not zero. Hover a name
          or line for the source confidence behind each figure. Split into two linear-scale charts at the single
          biggest turnover gap in the data, rather than one log-scaled chart — a log scale is mathematically
          correct for comparing ratios, but visually compresses genuinely large gaps into looking similar.
        </p>

        <div className="space-y-8">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">Larger / established competitors</h3>
            <CompetitorFinancialsChart financials={largerCompetitors} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">Smaller / emerging competitors</h3>
            <p className="text-xs text-[var(--text-secondary)] mb-2">Roughly DSEG&apos;s own scale or smaller.</p>
            <CompetitorFinancialsChart financials={smallerCompetitors} />
          </div>
        </div>
      </section>
    </div>
  );
}
