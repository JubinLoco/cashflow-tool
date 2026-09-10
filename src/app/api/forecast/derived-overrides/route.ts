import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// amount: null removes the override (reverts to the formula-derived estimate); a number
// upserts it. See derivedForecast.ts for the key scheme and where the override is applied.
export async function PATCH(request: NextRequest) {
  const supabase = createAdminClient();
  const { key, amount } = (await request.json()) as { key: string; amount: number | null };

  if (amount === null) {
    const { error } = await supabase.from("derived_forecast_overrides").delete().eq("key", key);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase.from("derived_forecast_overrides").upsert({ key, amount }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
