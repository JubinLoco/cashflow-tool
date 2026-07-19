import { readGameConfig } from "@/lib/territories/configStore";
import { getCurrentUserRole } from "@/lib/auth/role";
import type { TierRule } from "@/lib/territories/tiers";

function formatSEK(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M SEK/mo`;
  return `${Math.round(n / 1000)}k SEK/mo`;
}

function tierRangeLabel(rule: TierRule) {
  const turnover = rule.maxTurnover
    ? `${formatSEK(rule.minTurnover)} – ${formatSEK(rule.maxTurnover)}`
    : `${formatSEK(rule.minTurnover)}+`;
  const marginParts: string[] = [];
  if (rule.minMarginPct != null) marginParts.push(`${rule.minMarginPct}%+`);
  if (rule.maxMarginPct != null) marginParts.push(`up to ${rule.maxMarginPct}%`);
  const margin = marginParts.length ? marginParts.join(", ") : "any margin";
  return { turnover, margin };
}

export default async function TerritoriesRulesPage() {
  const [config, role] = await Promise.all([readGameConfig(), getCurrentUserRole()]);
  const tiers = [...config.tierRules].sort((a, b) => a.order - b.order).reverse();
  const isAdmin = role === "admin";

  return (
    <div className="max-w-3xl mx-auto w-full px-6 py-8 space-y-10">
      <header>
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">How to Play</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-2">
          DSEG Territories turns real market and account data into a Catan-style territory contest between
          distributors. It&apos;s a lens for a real strategic question: where should we focus, and what do we need to
          offer beyond price to win and keep the best accounts?
        </p>
      </header>

      <section>
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">The board</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Each of Sweden&apos;s 21 provinces is a region of the board, sized by its real market activity (new solar,
          battery, and EV charger installations, from government tax-deduction data). Inside each province,{" "}
          <strong className="text-[var(--text-primary)]">settlements</strong> are real customers of distributors —
          EPC companies, electricians, installers. Distributors (DSEG and its competitors) are{" "}
          <strong className="text-[var(--text-primary)]">empires</strong> competing to control settlements.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Settlement tiers</h2>
        <p className="text-sm text-[var(--text-secondary)] mb-3">
          A settlement&apos;s tier is based on its average <strong className="text-[var(--text-primary)]">monthly</strong>{" "}
          turnover (not annual) and the margin a distributor earns serving it. These are the current live thresholds
          {isAdmin ? (
            <>
              {" "}
              — adjust them on the{" "}
              <a href="/territories/settlements" className="underline text-[var(--text-primary)]">
                Settlements
              </a>{" "}
              page.
            </>
          ) : (
            "."
          )}
        </p>
        <div className="overflow-x-auto rounded-lg border border-[var(--panel-border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--panel-border)] text-left text-[var(--text-secondary)]">
                <th className="p-2 font-medium">Tier</th>
                <th className="p-2 font-medium">Monthly turnover</th>
                <th className="p-2 font-medium">Margin</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((t) => {
                const { turnover, margin } = tierRangeLabel(t);
                return (
                  <tr key={t.id} className="border-b border-[var(--panel-border)] last:border-0">
                    <td className="p-2 font-medium text-[var(--text-primary)]">{t.label}</td>
                    <td className="p-2 text-[var(--text-secondary)]">{turnover}</td>
                    <td className="p-2 text-[var(--text-secondary)]">{margin}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">The core tension</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          By nature of the market, high-turnover settlements attract more competitors, who bid margin down. A
          settlement can only become a <strong className="text-[var(--text-primary)]">Metropolis</strong> — high
          turnover <em>and</em> healthy margin — if DSEG offers something competitors can&apos;t easily match on price
          alone:
        </p>
        <ul className="mt-2 space-y-1 text-sm text-[var(--text-secondary)] list-disc list-inside">
          <li>Exclusivity</li>
          <li>Better support</li>
          <li>Free marketing and leads</li>
          <li>IT solutions</li>
        </ul>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Without that leverage, a high-turnover account becomes a <strong className="text-[var(--text-primary)]">City</strong>{" "}
          — big, but thin-margin and vulnerable to being taken by the next distributor willing to cut price further.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Empires, fallen empires, and raiders</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Competing distributors are tracked as <strong className="text-[var(--text-primary)]">empires</strong>, each
          with a rough size and trend estimated from market-size correlation and public financials. The higher an
          empire&apos;s turnover, the more supplier leverage it has — but running at too thin a margin for too long
          risks bankruptcy.
        </p>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          When an empire exits the market or goes bankrupt, it moves to the{" "}
          <strong className="text-[var(--text-primary)]">fallen empires</strong> list — a visible scoreboard of
          attrition, not just a deletion.
        </p>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          <strong className="text-[var(--text-primary)]">Raiders</strong> (installer roll-ups like SveaSolar and
          1Komma5°) aren&apos;t played as empires competing for individual settlements. Like the robber in Catan, they
          erode addressable market share for every distributor at once, DSEG included, by pulling installation work
          in-house and buying direct from manufacturers.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">The goal</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Grow DSEG&apos;s settlements toward Metropolis status, defend existing ones against competitors chasing the
          same turnover, and target settlements currently held by empires — especially ones that are shrinking,
          passive, or already fallen.
        </p>
      </section>
    </div>
  );
}
