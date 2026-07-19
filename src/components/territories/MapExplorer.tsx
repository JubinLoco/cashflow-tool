"use client";

import { useMemo, useState } from "react";
import SwedenMap from "@/components/territories/SwedenMap";
import MapLegend from "@/components/territories/MapLegend";
import type { TierRule } from "@/lib/territories/tiers";
import type { Competitor, MarketSize, ProvincesGeoJSON, Settlement } from "@/lib/territories/types";

type CompetitorMarker = {
  id: string;
  displayName: string;
  province: string;
  status: string;
  revenueEstimateSEK?: number;
};

type ProspectMarker = {
  id: string;
  name: string;
  province: string;
  currentCompetitorId: string | null;
  currentCompetitorName: string | null;
  potentialTier: string;
  note: string;
};

// Toggles a single id in/out of a hidden-set; used identically for tiers and competitors.
function toggle(prev: Set<string>, id: string): Set<string> {
  const next = new Set(prev);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

// Double-click "isolate": hide every other id in the group, unless this id is already
// the sole visible one, in which case reset back to showing everything.
function isolate(prev: Set<string>, id: string, allIds: string[]): Set<string> {
  const others = allIds.filter((otherId) => otherId !== id);
  const alreadyIsolated = !prev.has(id) && others.every((otherId) => prev.has(otherId));
  return alreadyIsolated ? new Set() : new Set(others);
}

export default function MapExplorer({
  geojson,
  marketByProvince,
  settlements,
  tierRules,
  legendTiers,
  competitors,
  empires,
  prospects,
  hasProspects,
}: {
  geojson: ProvincesGeoJSON;
  marketByProvince: Map<string, MarketSize>;
  settlements: Settlement[];
  tierRules: TierRule[];
  legendTiers: TierRule[];
  competitors: CompetitorMarker[];
  empires: Competitor[];
  prospects: ProspectMarker[];
  hasProspects: boolean;
}) {
  const [hiddenTiers, setHiddenTiers] = useState<Set<string>>(new Set());
  const [hiddenCompetitors, setHiddenCompetitors] = useState<Set<string>>(new Set());
  const [prospectsHidden, setProspectsHidden] = useState(false);

  const tierIds = useMemo(() => legendTiers.map((t) => t.id), [legendTiers]);
  const empireIds = useMemo(() => empires.map((e) => e.id), [empires]);

  const filtersActive = hiddenTiers.size > 0 || hiddenCompetitors.size > 0 || prospectsHidden;

  function resetFilters() {
    setHiddenTiers(new Set());
    setHiddenCompetitors(new Set());
    setProspectsHidden(false);
  }

  return (
    <>
      <SwedenMap
        geojson={geojson}
        marketByProvince={marketByProvince}
        settlements={settlements}
        tierRules={tierRules}
        competitors={competitors}
        prospects={prospects}
        hiddenTiers={hiddenTiers}
        hiddenCompetitors={hiddenCompetitors}
        prospectsHidden={prospectsHidden}
      />
      <MapLegend
        legendTiers={legendTiers}
        empires={empires}
        hasProspects={hasProspects}
        hiddenTiers={hiddenTiers}
        hiddenCompetitors={hiddenCompetitors}
        prospectsHidden={prospectsHidden}
        filtersActive={filtersActive}
        onToggleTier={(id) => setHiddenTiers((prev) => toggle(prev, id))}
        onIsolateTier={(id) => setHiddenTiers((prev) => isolate(prev, id, tierIds))}
        onToggleCompetitor={(id) => setHiddenCompetitors((prev) => toggle(prev, id))}
        onIsolateCompetitor={(id) => setHiddenCompetitors((prev) => isolate(prev, id, empireIds))}
        onToggleProspects={() => setProspectsHidden((v) => !v)}
        onReset={resetFilters}
      />
    </>
  );
}
