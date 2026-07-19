import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { readGameConfig } from "@/lib/territories/configStore";
import type { Prospect } from "@/lib/territories/tiers";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Omit<Prospect, "id" | "createdAt">;

  if (!body.name || !body.province || !body.potentialTier) {
    return NextResponse.json({ error: "Expected name, province, and potentialTier" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("territories_prospects").insert({
    name: body.name,
    province: body.province,
    current_competitor_id: body.currentCompetitorId ?? null,
    potential_tier: body.potentialTier,
    note: body.note ?? "",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const config = await readGameConfig();
  return NextResponse.json(config);
}
