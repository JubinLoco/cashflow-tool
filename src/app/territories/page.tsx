import MapExplorer from "@/components/territories/MapExplorer";
import CompetitorPanel from "@/components/territories/CompetitorPanel";
import { classifyAllSettlements, type MonthlyHistoryMap } from "@/lib/territories/classifySettlements";
import { readGameConfig } from "@/lib/territories/configStore";
import provincesGeojson from "@/data/territories/provinces.geojson.json";
import marketSizeData from "@/data/territories/market-size.json";
import settlementsData from "@/data/territories/settlements.json";
import settlementHistoryData from "@/data/territories/settlement-monthly-history.json";
import competitorsData from "@/data/territories/competitors.json";
import type { CompetitorRoster, MarketSize, ProvincesGeoJSON, Settlement } from "@/lib/territories/types";

export default async function TerritoriesPage() {
  const geojson = provincesGeojson as ProvincesGeoJSON;
  const marketSize = marketSizeData as MarketSize[];
  const rawSettlements = settlementsData as Settlement[];
  const roster = competitorsData as CompetitorRoster;
  const config = await readGameConfig();

  const classified = classifyAllSettlements(rawSettlements, settlementHistoryData as MonthlyHistoryMap, config);
  const settlements: Settlement[] = classified.map((s) => ({ ...s, tier: s.classification.tier }));

  const legendTiers = [...config.tierRules].sort((a, b) => b.order - a.order);

  const competitorMarkers = roster.empires
    .filter((c): c is typeof c & { province: string } => Boolean(c.province))
    .map((c) => ({
      id: c.id,
      displayName: c.displayName,
      province: c.province,
      status: c.status,
      revenueEstimateSEK: c.revenueEstimateSEK,
    }));

  const prospectMarkers = config.prospects.map((p) => ({
    id: p.id,
    name: p.name,
    province: p.province,
    currentCompetitorId: p.currentCompetitorId,
    currentCompetitorName: roster.empires.find((c) => c.id === p.currentCompetitorId)?.displayName ?? null,
    potentialTier: p.potentialTier,
    note: p.note,
  }));

  const marketByProvince = new Map(marketSize.map((m) => [m.province, m]));
  const totalTurnover = settlements.reduce((sum, s) => sum + s.trailing12moTurnover, 0);
  const placedSettlements = settlements.filter((s) => s.province);
  const unplacedCount = settlements.length - placedSettlements.length;

  return (
    <div className="min-h-screen max-w-[1600px] mx-auto w-full px-6 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">DSEG Territories</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          {roster.player.name}&apos;s settlements vs. {roster.empires.length} competing distributor empires, across
          Sweden&apos;s {geojson.features.length} provinces. Trailing-12-month DSEG turnover:{" "}
          {Math.round(totalTurnover / 1_000_000).toLocaleString("sv-SE")}M SEK across {placedSettlements.length}{" "}
          settlements
          {unplacedCount > 0 && ` (${unplacedCount} unplaced — no matched province)`}.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6">
        <div className="rounded-xl border border-[var(--panel-border)] bg-[var(--panel-surface)] p-4">
          <MapExplorer
            geojson={geojson}
            marketByProvince={marketByProvince}
            settlements={settlements}
            tierRules={config.tierRules}
            legendTiers={legendTiers}
            competitors={competitorMarkers}
            empires={roster.empires}
            prospects={prospectMarkers}
            hasProspects={prospectMarkers.length > 0}
          />
        </div>

        <aside className="rounded-xl border border-[var(--panel-border)] bg-[var(--panel-surface)] p-4">
          <CompetitorPanel roster={roster} />
        </aside>
      </div>
    </div>
  );
}
