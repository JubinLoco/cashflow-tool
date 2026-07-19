"use client";

import { useMemo, useState } from "react";
import { buildProjection, round, spiralOffset } from "@/lib/territories/projection";
import { competitorColorFor, makeQuantileScale, SEQUENTIAL_BLUE, tierColorScale, UNKNOWN_TIER_COLOR } from "@/lib/territories/color";
import { tierShapeScale, shapePoints } from "@/lib/territories/shapes";
import { useColorScheme } from "@/lib/territories/useColorScheme";
import { tierLabel, type TierRule } from "@/lib/territories/tiers";
import type { MarketSize, ProvincesGeoJSON, Settlement } from "@/lib/territories/types";

const WIDTH = 620;
const HEIGHT = 900;
const DEFAULT_VIEWBOX = `0 0 ${WIDTH} ${HEIGHT}`;
const ZOOM_PADDING_RATIO = 0.35; // extra room around a zoomed province so its markers aren't flush against the edge
// Fixed light outline for settlement/competitor markers (not theme-dependent) -- a
// dark-colored marker sitting on a dark province needs a light ring to stay visible
// regardless of which theme is active; a light ring never hurts on a light surface either.
const MARKER_OUTLINE = "#fdfdfd";

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

export default function SwedenMap({
  geojson,
  marketByProvince,
  settlements,
  tierRules,
  competitors,
  prospects,
  hiddenTiers,
  hiddenCompetitors,
  prospectsHidden,
}: {
  geojson: ProvincesGeoJSON;
  marketByProvince: Map<string, MarketSize>;
  settlements: Settlement[];
  tierRules: TierRule[];
  competitors: CompetitorMarker[];
  prospects: ProspectMarker[];
  hiddenTiers: Set<string>;
  hiddenCompetitors: Set<string>;
  prospectsHidden: boolean;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const mode = useColorScheme();

  const { path } = useMemo(() => buildProjection(geojson, WIDTH, HEIGHT), [geojson]);

  const tierColors = useMemo(() => tierColorScale(tierRules), [tierRules]);
  const tierShapes = useMemo(() => tierShapeScale(tierRules), [tierRules]);

  const colorScale = useMemo(() => {
    const values = geojson.features.map((f) => marketByProvince.get(f.properties.name)?.total ?? 0);
    return makeQuantileScale(values, SEQUENTIAL_BLUE);
  }, [geojson, marketByProvince]);

  const settlementsByProvince = useMemo(() => {
    const map = new Map<string, Settlement[]>();
    for (const s of settlements) {
      if (!s.province || hiddenTiers.has(s.tier)) continue;
      const list = map.get(s.province) ?? [];
      list.push(s);
      map.set(s.province, list);
    }
    for (const list of map.values()) list.sort((a, b) => b.trailing12moTurnover - a.trailing12moTurnover);
    return map;
  }, [settlements, hiddenTiers]);

  const competitorsByProvince = useMemo(() => {
    const map = new Map<string, CompetitorMarker[]>();
    for (const c of competitors) {
      if (hiddenCompetitors.has(c.id)) continue;
      const list = map.get(c.province) ?? [];
      list.push(c);
      map.set(c.province, list);
    }
    for (const list of map.values()) list.sort((a, b) => (b.revenueEstimateSEK ?? 0) - (a.revenueEstimateSEK ?? 0));
    return map;
  }, [competitors, hiddenCompetitors]);

  const prospectsByProvince = useMemo(() => {
    const map = new Map<string, ProspectMarker[]>();
    if (prospectsHidden) return map;
    for (const p of prospects) {
      // A prospect currently held by a competitor whose HQ is filtered out follows that
      // competitor's visibility -- it's their settlement, so isolating/hiding one hides the other.
      if (p.currentCompetitorId && hiddenCompetitors.has(p.currentCompetitorId)) continue;
      const list = map.get(p.province) ?? [];
      list.push(p);
      map.set(p.province, list);
    }
    return map;
  }, [prospects, prospectsHidden, hiddenCompetitors]);

  const viewBox = useMemo(() => {
    if (!pinned) return DEFAULT_VIEWBOX;
    const feature = geojson.features.find((f) => f.properties.name === pinned);
    if (!feature) return DEFAULT_VIEWBOX;
    const [[x0, y0], [x1, y1]] = path.bounds(feature as never);
    const w = x1 - x0;
    const h = y1 - y0;
    const padX = w * ZOOM_PADDING_RATIO;
    const padY = h * ZOOM_PADDING_RATIO;
    return `${x0 - padX} ${y0 - padY} ${w + padX * 2} ${h + padY * 2}`;
  }, [pinned, geojson, path]);

  // While a province is pinned, the panel shows its full detail regardless of mouse
  // movement; otherwise it follows hover as a lighter preview.
  const displayedProvince = pinned ?? hovered;
  const displayedMarket = displayedProvince ? marketByProvince.get(displayedProvince) : null;
  const displayedSettlements = displayedProvince ? (settlementsByProvince.get(displayedProvince) ?? []) : [];
  const displayedCompetitors = displayedProvince ? (competitorsByProvince.get(displayedProvince) ?? []) : [];
  const displayedProspects = displayedProvince ? (prospectsByProvince.get(displayedProvince) ?? []) : [];

  function handleProvinceClick(name: string) {
    setPinned((p) => (p === name ? null : name));
  }

  return (
    <div className="relative">
      <svg viewBox={viewBox} className="w-full h-auto max-h-[80vh] transition-[view-box] duration-300" role="img" aria-label="Map of Sweden's provinces">
        <g>
          {geojson.features.map((feature) => {
            const name = feature.properties.name;
            const d = path(feature as never) ?? "";
            const market = marketByProvince.get(name);
            const fill = colorScale(market?.total ?? 0);
            const isHighlighted = name === pinned || (!pinned && name === hovered);
            return (
              <path
                key={feature.properties.lanskod}
                d={d}
                fill={fill}
                stroke={UNKNOWN_TIER_COLOR}
                strokeWidth={isHighlighted ? 2.25 : 1.1}
                onMouseEnter={() => setHovered(name)}
                onMouseLeave={() => setHovered((h) => (h === name ? null : h))}
                onClick={() => handleProvinceClick(name)}
                style={{ cursor: "pointer", transition: "stroke-width 120ms" }}
              />
            );
          })}
        </g>
        <g>
          {geojson.features.map((feature) => {
            const name = feature.properties.name;
            const list = settlementsByProvince.get(name) ?? [];
            if (list.length === 0) return null;
            const centroid = path.centroid(feature as never);
            if (!Number.isFinite(centroid[0])) return null;
            return (
              <g key={`dots-${feature.properties.lanskod}`}>
                {list.map((s, i) => {
                  const [dx, dy] = spiralOffset(i, 6);
                  const cx = round(centroid[0] + dx);
                  const cy = round(centroid[1] + dy);
                  const r = round(3 + Math.min(6, Math.sqrt(s.trailing12moTurnover / 200_000)));
                  const fill = tierColors[s.tier] ?? UNKNOWN_TIER_COLOR;
                  const shape = tierShapes[s.tier] ?? "circle";
                  const points = shapePoints(shape, cx, cy, r);
                  const title = `${s.name} — ${tierLabel(s.tier, tierRules)} — ${Math.round(s.trailing12moTurnover).toLocaleString("sv-SE")} SEK`;
                  return points ? (
                    <polygon key={s.customerNumber} points={points} fill={fill} stroke={MARKER_OUTLINE} strokeWidth={1.2} strokeLinejoin="round">
                      <title>{title}</title>
                    </polygon>
                  ) : (
                    <circle key={s.customerNumber} cx={cx} cy={cy} r={r} fill={fill} stroke={MARKER_OUTLINE} strokeWidth={1.2}>
                      <title>{title}</title>
                    </circle>
                  );
                })}
              </g>
            );
          })}
        </g>
        <g>
          {geojson.features.map((feature) => {
            const name = feature.properties.name;
            const list = competitorsByProvince.get(name) ?? [];
            if (list.length === 0) return null;
            const centroid = path.centroid(feature as never);
            if (!Number.isFinite(centroid[0])) return null;
            // Offset to the opposite side from the settlement dot cluster so the two
            // marker families don't visually merge into one blob.
            const baseX = centroid[0] - 16;
            const baseY = centroid[1] - 16;
            return (
              <g key={`competitors-${feature.properties.lanskod}`}>
                {list.map((c, i) => {
                  const [dx, dy] = spiralOffset(i, 7);
                  const cx = round(baseX + dx);
                  const cy = round(baseY + dy);
                  const revenue = c.revenueEstimateSEK ?? 0;
                  const size = round(6 + Math.max(0, Math.min(8, (Math.log10(Math.max(revenue, 1e6)) - 7) * 4)));
                  const fill = competitorColorFor(c.id, mode);
                  const isFallen = c.status === "exited" || c.status === "bankrupt";
                  return (
                    <rect
                      key={c.id}
                      x={round(cx - size / 2)}
                      y={round(cy - size / 2)}
                      width={size}
                      height={size}
                      transform={`rotate(45 ${cx} ${cy})`}
                      fill={isFallen ? "none" : fill}
                      stroke={isFallen ? fill : MARKER_OUTLINE}
                      strokeWidth={isFallen ? 1.5 : 1.75}
                      strokeDasharray={isFallen ? "2,2" : undefined}
                      opacity={isFallen ? 0.6 : 1}
                    >
                      <title>{`${c.displayName} (HQ) — ${c.status}${revenue ? ` — ${Math.round(revenue / 1_000_000).toLocaleString("sv-SE")}M SEK` : ""}`}</title>
                    </rect>
                  );
                })}
              </g>
            );
          })}
        </g>
        <g>
          {geojson.features.map((feature) => {
            const name = feature.properties.name;
            const list = prospectsByProvince.get(name) ?? [];
            if (list.length === 0) return null;
            const centroid = path.centroid(feature as never);
            if (!Number.isFinite(centroid[0])) return null;
            // Third cluster position (opposite corner from competitor HQs) so settlements,
            // competitor HQs, and prospects each get their own visual space per province.
            const baseX = centroid[0] + 16;
            const baseY = centroid[1] + 16;
            return (
              <g key={`prospects-${feature.properties.lanskod}`}>
                {list.map((p, i) => {
                  const [dx, dy] = spiralOffset(i, 7);
                  const cx = round(baseX + dx);
                  const cy = round(baseY + dy);
                  const color = p.currentCompetitorId ? competitorColorFor(p.currentCompetitorId, mode) : UNKNOWN_TIER_COLOR;
                  const size = 7;
                  const points = `${cx},${cy - size} ${cx - size},${cy + size} ${cx + size},${cy + size}`;
                  return (
                    <polygon key={p.id} points={points} fill="none" stroke={color} strokeWidth={1.5} strokeDasharray="2,2">
                      <title>
                        {`${p.name} — prospect, potential: ${tierLabel(p.potentialTier, tierRules)}${
                          p.currentCompetitorName ? ` — currently held by ${p.currentCompetitorName}` : ""
                        }${p.note ? ` — ${p.note}` : ""}`}
                      </title>
                    </polygon>
                  );
                })}
              </g>
            );
          })}
        </g>
      </svg>

      {pinned && (
        <button
          onClick={() => setPinned(null)}
          className="absolute top-2 left-2 text-xs px-2.5 py-1 rounded-md border border-[var(--panel-border)] bg-[var(--panel-surface)] text-[var(--text-primary)] shadow-sm hover:bg-[var(--map-surface)]"
        >
          ← Show all Sweden
        </button>
      )}

      {displayedProvince &&
        (pinned ? (
          <div className="absolute top-2 right-2 w-80 max-h-[calc(80vh-1rem)] overflow-y-auto rounded-lg border border-[var(--panel-border)] bg-[var(--panel-surface)] p-3 text-sm shadow-lg">
            <div className="flex items-start justify-between gap-2">
              <div className="font-semibold text-[var(--text-primary)]">{displayedProvince}</div>
              <button
                onClick={() => setPinned(null)}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] leading-none text-base"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            {displayedMarket && (
              <div className="mt-1 text-[var(--text-secondary)] space-y-0.5">
                <div>Solar installs (12mo): {displayedMarket.solar.toLocaleString("sv-SE")}</div>
                <div>Battery installs (12mo): {displayedMarket.battery.toLocaleString("sv-SE")}</div>
                <div>EV charger installs (12mo): {displayedMarket.evCharger.toLocaleString("sv-SE")}</div>
              </div>
            )}
            <div className="mt-2 border-t border-[var(--panel-border)] pt-2">
              <div className="text-[var(--text-secondary)] mb-1">DSEG settlements: {displayedSettlements.length}</div>
              {displayedSettlements.map((s) => (
                <div key={s.customerNumber} className="flex justify-between gap-2 text-xs text-[var(--text-primary)] py-0.5">
                  <span className="truncate">{s.name}</span>
                  <span className="text-[var(--text-secondary)] whitespace-nowrap">
                    {tierLabel(s.tier, tierRules)} · {Math.round(s.trailing12moTurnover / 1000)}k
                  </span>
                </div>
              ))}
            </div>
            {displayedCompetitors.length > 0 && (
              <div className="mt-2 border-t border-[var(--panel-border)] pt-2">
                <div className="text-[var(--text-secondary)] mb-1">Competitor HQs: {displayedCompetitors.length}</div>
                {displayedCompetitors.map((c) => (
                  <div key={c.id} className="flex justify-between gap-2 text-xs text-[var(--text-primary)] py-0.5">
                    <span className="truncate">{c.displayName}</span>
                    <span className="text-[var(--text-secondary)] whitespace-nowrap capitalize">{c.status}</span>
                  </div>
                ))}
              </div>
            )}
            {displayedProspects.length > 0 && (
              <div className="mt-2 border-t border-[var(--panel-border)] pt-2">
                <div className="text-[var(--text-secondary)] mb-1">Prospects (△): {displayedProspects.length}</div>
                {displayedProspects.map((p) => (
                  <div key={p.id} className="flex justify-between gap-2 text-xs text-[var(--text-primary)] py-0.5">
                    <span className="truncate">{p.name}</span>
                    <span className="text-[var(--text-secondary)] whitespace-nowrap">→ {tierLabel(p.potentialTier, tierRules)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="absolute top-2 right-2 w-64 rounded-lg border border-[var(--panel-border)] bg-[var(--panel-surface)] p-3 text-sm shadow-lg pointer-events-none">
            <div className="font-semibold text-[var(--text-primary)]">{displayedProvince}</div>
            {displayedMarket && (
              <div className="mt-1 text-[var(--text-secondary)] space-y-0.5">
                <div>Solar installs (12mo): {displayedMarket.solar.toLocaleString("sv-SE")}</div>
                <div>Battery installs (12mo): {displayedMarket.battery.toLocaleString("sv-SE")}</div>
                <div>EV charger installs (12mo): {displayedMarket.evCharger.toLocaleString("sv-SE")}</div>
              </div>
            )}
            <div className="mt-2 border-t border-[var(--panel-border)] pt-2">
              <div className="text-[var(--text-secondary)] mb-1">DSEG settlements: {displayedSettlements.length}</div>
              {displayedSettlements.slice(0, 5).map((s) => (
                <div key={s.customerNumber} className="flex justify-between gap-2 text-xs text-[var(--text-primary)]">
                  <span className="truncate">{s.name}</span>
                  <span className="text-[var(--text-secondary)] whitespace-nowrap">
                    {Math.round(s.trailing12moTurnover / 1000)}k
                  </span>
                </div>
              ))}
              {displayedSettlements.length > 5 && (
                <div className="text-xs text-[var(--text-secondary)] mt-1">+{displayedSettlements.length - 5} more</div>
              )}
            </div>
            {displayedCompetitors.length > 0 && (
              <div className="mt-2 border-t border-[var(--panel-border)] pt-2">
                <div className="text-[var(--text-secondary)] mb-1">Competitor HQs: {displayedCompetitors.length}</div>
                {displayedCompetitors.map((c) => (
                  <div key={c.id} className="flex justify-between gap-2 text-xs text-[var(--text-primary)]">
                    <span className="truncate">{c.displayName}</span>
                    <span className="text-[var(--text-secondary)] whitespace-nowrap capitalize">{c.status}</span>
                  </div>
                ))}
              </div>
            )}
            {displayedProspects.length > 0 && (
              <div className="mt-2 border-t border-[var(--panel-border)] pt-2">
                <div className="text-[var(--text-secondary)] mb-1">Prospects (△): {displayedProspects.length}</div>
                {displayedProspects.map((p) => (
                  <div key={p.id} className="flex justify-between gap-2 text-xs text-[var(--text-primary)]">
                    <span className="truncate">{p.name}</span>
                    <span className="text-[var(--text-secondary)] whitespace-nowrap">→ {tierLabel(p.potentialTier, tierRules)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2 text-xs text-[var(--text-secondary)] italic">Click to pin &amp; zoom in</div>
          </div>
        ))}
    </div>
  );
}
