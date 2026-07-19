import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { readGameConfig } from "@/lib/territories/configStore";
import type { TierRule } from "@/lib/territories/tiers";

// Replaces the entire tier_rules table -- the client always PUTs the full draft array
// (same contract as the old file-based store), so delete-all + insert is simplest and
// avoids reconciling adds/edits/removals row by row.
export async function PUT(request: NextRequest) {
  const rules = (await request.json()) as TierRule[];

  if (!Array.isArray(rules) || rules.some((r) => !r.id || !r.label)) {
    return NextResponse.json({ error: "Expected an array of tier rules with id and label" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { error: deleteError } = await supabase.from("territories_tier_rules").delete().not("id", "is", null);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  const rows = rules.map((r) => ({
    id: r.id,
    label: r.label,
    sort_order: r.order,
    min_turnover: r.minTurnover,
    max_turnover: r.maxTurnover,
    min_margin_pct: r.minMarginPct,
    max_margin_pct: r.maxMarginPct,
  }));

  const { error: insertError } = await supabase.from("territories_tier_rules").insert(rows);
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const config = await readGameConfig();
  return NextResponse.json(config);
}
