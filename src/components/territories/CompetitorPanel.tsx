import { STATUS_COLOR, STATUS_LABEL } from "@/lib/territories/color";
import type { CompetitorRoster } from "@/lib/territories/types";

function formatRevenue(sek?: number) {
  if (!sek) return null;
  if (sek >= 1_000_000_000) return `${(sek / 1_000_000_000).toFixed(1)}B SEK`;
  return `${Math.round(sek / 1_000_000)}M SEK`;
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ color: STATUS_COLOR[status], border: `1px solid ${STATUS_COLOR[status]}` }}
    >
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: STATUS_COLOR[status] }} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export default function CompetitorPanel({ roster }: { roster: CompetitorRoster }) {
  const active = roster.empires.filter((e) => e.status === "active" || e.status === "passive");
  const fallen = roster.empires.filter((e) => e.status === "exited" || e.status === "bankrupt");

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)] mb-2">
          Empires ({active.length})
        </h2>
        <ul className="space-y-2">
          {active.map((c) => (
            <li key={c.id} className="rounded-lg border border-[var(--panel-border)] p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-[var(--text-primary)]">{c.displayName}</span>
                <StatusPill status={c.status} />
              </div>
              <div className="mt-1 text-xs text-[var(--text-secondary)] flex flex-wrap gap-x-3 gap-y-0.5">
                {formatRevenue(c.revenueEstimateSEK) && (
                  <span>
                    {formatRevenue(c.revenueEstimateSEK)} ({c.revenueYear})
                  </span>
                )}
                {c.revenueTrend && <span>{c.revenueTrend}</span>}
              </div>
              {c.statusNote && <div className="mt-1 text-xs text-[var(--text-secondary)] italic">{c.statusNote}</div>}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)] mb-2">
          Fallen empires ({fallen.length})
        </h2>
        <ul className="space-y-2">
          {fallen.map((c) => (
            <li
              key={c.id}
              className="rounded-lg border border-[var(--panel-border)] p-2.5 opacity-60"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-[var(--text-primary)] line-through decoration-1">{c.displayName}</span>
                <StatusPill status={c.status} />
              </div>
              {c.statusNote && <div className="mt-1 text-xs text-[var(--text-secondary)]">{c.statusNote}</div>}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)] mb-2">
          Raiders
        </h2>
        <p className="text-xs text-[var(--text-secondary)] mb-2">{roster.disintermediation_threats.description}</p>
        <ul className="space-y-2">
          {roster.disintermediation_threats.members.map((m) => (
            <li
              key={m.id}
              className="rounded-lg border border-dashed p-2.5"
              style={{ borderColor: "var(--panel-border)" }}
            >
              <div className="font-medium text-[var(--text-primary)]">{m.displayName}</div>
              {m.legalNote && <div className="mt-1 text-xs text-[var(--text-secondary)]">{m.legalNote}</div>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
