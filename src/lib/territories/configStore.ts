import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_GAME_CONFIG,
  type GameConfig,
  type Prospect,
  type SettlementOverride,
  type SettlementPotential,
  type TierRule,
} from "./tiers";

type TierRuleRow = {
  id: string;
  label: string;
  sort_order: number;
  min_turnover: number;
  max_turnover: number | null;
  min_margin_pct: number | null;
  max_margin_pct: number | null;
};

type OverrideOrPotentialRow = { customer_number: string; tier: string; note: string | null; set_at: string };

type ProspectRow = {
  id: string;
  name: string;
  province: string;
  current_competitor_id: string | null;
  potential_tier: string;
  note: string | null;
  created_at: string;
};

function rowToTierRule(row: TierRuleRow): TierRule {
  return {
    id: row.id,
    label: row.label,
    order: row.sort_order,
    minTurnover: row.min_turnover,
    maxTurnover: row.max_turnover,
    minMarginPct: row.min_margin_pct,
    maxMarginPct: row.max_margin_pct,
  };
}

function rowToOverrideOrPotential(row: OverrideOrPotentialRow): SettlementOverride | SettlementPotential {
  return { tier: row.tier, note: row.note ?? "", setAt: row.set_at };
}

function rowToProspect(row: ProspectRow): Prospect {
  return {
    id: row.id,
    name: row.name,
    province: row.province,
    currentCompetitorId: row.current_competitor_id,
    potentialTier: row.potential_tier,
    note: row.note ?? "",
    createdAt: row.created_at,
  };
}

/**
 * Assembles the GameConfig shape from the 4 territories_* Supabase tables (see
 * supabase/migrations/0020_territories_config.sql) -- for direct use by server-component
 * pages (no HTTP round-trip) and by GET /api/territories/config. Replaces the old
 * file-based gameConfigStore.ts, which wrote to a local JSON file that doesn't survive
 * Vercel's ephemeral filesystem.
 */
export async function readGameConfig(): Promise<GameConfig> {
  const supabase = createAdminClient();

  const [tierRulesRes, overridesRes, potentialsRes, prospectsRes] = await Promise.all([
    supabase.from("territories_tier_rules").select("*").order("sort_order", { ascending: true }),
    supabase.from("territories_overrides").select("*"),
    supabase.from("territories_potentials").select("*"),
    supabase.from("territories_prospects").select("*").order("created_at", { ascending: true }),
  ]);

  if (tierRulesRes.error) throw new Error(tierRulesRes.error.message);
  if (overridesRes.error) throw new Error(overridesRes.error.message);
  if (potentialsRes.error) throw new Error(potentialsRes.error.message);
  if (prospectsRes.error) throw new Error(prospectsRes.error.message);

  // The table is seeded by migration 0020 and should never actually be empty in practice;
  // this fallback only matters if the migration hasn't been applied yet.
  const tierRules = tierRulesRes.data?.length
    ? (tierRulesRes.data as TierRuleRow[]).map(rowToTierRule)
    : DEFAULT_GAME_CONFIG.tierRules;

  const overrides: Record<string, SettlementOverride> = {};
  for (const row of (overridesRes.data ?? []) as OverrideOrPotentialRow[]) {
    overrides[row.customer_number] = rowToOverrideOrPotential(row);
  }

  const potentials: Record<string, SettlementPotential> = {};
  for (const row of (potentialsRes.data ?? []) as OverrideOrPotentialRow[]) {
    potentials[row.customer_number] = rowToOverrideOrPotential(row);
  }

  const prospects = ((prospectsRes.data ?? []) as ProspectRow[]).map(rowToProspect);

  return { tierRules, overrides, potentials, prospects };
}
