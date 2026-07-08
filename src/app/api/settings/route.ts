import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = createAdminClient();

  const [{ data: settings, error: settingsError }, { data: limitsRows, error: limitsError }] = await Promise.all([
    supabase.from("settings").select("key, value"),
    supabase.from("factoring_facility_limits").select("*").order("effective_from", { ascending: false }).limit(1),
  ]);

  if (settingsError) return NextResponse.json({ error: settingsError.message }, { status: 500 });
  if (limitsError) return NextResponse.json({ error: limitsError.message }, { status: 500 });

  return NextResponse.json({
    settings: Object.fromEntries((settings ?? []).map((r) => [r.key, r.value])),
    facilityLimits: limitsRows?.[0] ?? null,
  });
}

export async function PATCH(request: NextRequest) {
  const supabase = createAdminClient();
  const body = await request.json();
  const { settings, facilityLimits } = body as {
    settings?: Record<string, number>;
    facilityLimits?: { total_eligible_credit: number; customer_cap_pct: number; invoice_cap_pct: number };
  };

  if (settings) {
    const rows = Object.entries(settings).map(([key, value]) => ({ key, value }));
    const { error } = await supabase.from("settings").upsert(rows, { onConflict: "key" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (facilityLimits) {
    const today = new Date().toISOString().slice(0, 10);
    const { data: existing } = await supabase
      .from("factoring_facility_limits")
      .select("id")
      .eq("effective_from", today)
      .maybeSingle();

    const { error } = existing
      ? await supabase.from("factoring_facility_limits").update(facilityLimits).eq("id", existing.id)
      : await supabase.from("factoring_facility_limits").insert({ ...facilityLimits, effective_from: today });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
