"use client";

import { useState } from "react";
import { competitorColorFor, SEQUENTIAL_BLUE, tierColorScale } from "@/lib/territories/color";
import { tierShapeScale, shapePoints } from "@/lib/territories/shapes";
import { useColorScheme } from "@/lib/territories/useColorScheme";
import type { TierRule } from "@/lib/territories/tiers";
import type { Competitor } from "@/lib/territories/types";

function TierShapeIcon({ shape, color }: { shape: ReturnType<typeof tierShapeScale>[string]; color: string }) {
  const points = shapePoints(shape, 6, 6, 4);
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" className="shrink-0">
      {points ? <polygon points={points} fill={color} /> : <circle cx={6} cy={6} r={4} fill={color} />}
    </svg>
  );
}

export default function MapLegend({
  legendTiers,
  empires,
  hasProspects,
  hiddenTiers,
  hiddenCompetitors,
  prospectsHidden,
  filtersActive,
  onToggleTier,
  onIsolateTier,
  onToggleCompetitor,
  onIsolateCompetitor,
  onToggleProspects,
  onReset,
}: {
  legendTiers: TierRule[];
  empires: Competitor[];
  hasProspects: boolean;
  hiddenTiers: Set<string>;
  hiddenCompetitors: Set<string>;
  prospectsHidden: boolean;
  filtersActive: boolean;
  onToggleTier: (id: string) => void;
  onIsolateTier: (id: string) => void;
  onToggleCompetitor: (id: string) => void;
  onIsolateCompetitor: (id: string) => void;
  onToggleProspects: () => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const mode = useColorScheme();
  const tierColors = tierColorScale(legendTiers);
  const tierShapes = tierShapeScale(legendTiers);

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-xs px-2.5 py-1 rounded-md border border-[var(--panel-border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          {open ? "Hide legend ▲" : "Show legend ▼"}
        </button>
        {filtersActive && (
          <button onClick={onReset} className="text-xs text-[var(--text-secondary)] underline hover:text-[var(--text-primary)]">
            Reset filters
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 flex flex-wrap gap-x-8 gap-y-3 text-xs text-[var(--text-secondary)]">
          <div>
            <div className="mb-1 font-medium text-[var(--text-primary)]">Market size (12mo installs)</div>
            <div className="flex items-center gap-0.5">
              <span>Low</span>
              {SEQUENTIAL_BLUE.map((c) => (
                <span key={c} className="inline-block w-4 h-3" style={{ background: c }} />
              ))}
              <span>High</span>
            </div>
          </div>
          <div>
            <div className="mb-1 font-medium text-[var(--text-primary)]">
              DSEG settlement tier (click to hide, double-click to isolate —{" "}
              <a href="/territories/settlements" className="underline">
                edit rules
              </a>
              )
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {legendTiers.map((rule) => {
                const hidden = hiddenTiers.has(rule.id);
                return (
                  <button
                    key={rule.id}
                    onClick={() => onToggleTier(rule.id)}
                    onDoubleClick={() => onIsolateTier(rule.id)}
                    title="Click to hide, double-click to isolate"
                    className="flex items-center gap-1 cursor-pointer"
                    style={{ opacity: hidden ? 0.35 : 1 }}
                  >
                    <TierShapeIcon shape={tierShapes[rule.id]} color={tierColors[rule.id]} />
                    <span className={hidden ? "line-through" : undefined}>{rule.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="w-full">
            <div className="mb-1 font-medium text-[var(--text-primary)]">
              Competitor HQ (◆ solid = active/passive, ◇ dashed = fallen, click to hide, double-click to isolate) — same
              colors as{" "}
              <a href="/territories/trends" className="underline">
                Trends
              </a>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {empires.map((c) => {
                const hidden = hiddenCompetitors.has(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => onToggleCompetitor(c.id)}
                    onDoubleClick={() => onIsolateCompetitor(c.id)}
                    title="Click to hide, double-click to isolate"
                    className="flex items-center gap-1 cursor-pointer"
                    style={{ opacity: hidden ? 0.35 : 1 }}
                  >
                    <span className="inline-block w-2.5 h-2.5 rotate-45" style={{ background: competitorColorFor(c.id, mode) }} />
                    <span className={hidden ? "line-through" : undefined}>{c.displayName}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {hasProspects && (
            <div>
              <div
                role="button"
                tabIndex={0}
                onClick={onToggleProspects}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onToggleProspects()}
                title="Click to hide"
                className="flex items-center gap-1 cursor-pointer mb-1 font-medium text-[var(--text-primary)]"
                style={{ opacity: prospectsHidden ? 0.35 : 1 }}
              >
                <span className={prospectsHidden ? "line-through" : undefined}>
                  Prospects (△ dashed, not yet won — edit on{" "}
                  <a href="/territories/settlements" className="underline" onClick={(e) => e.stopPropagation()}>
                    Settlements
                  </a>
                  )
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
