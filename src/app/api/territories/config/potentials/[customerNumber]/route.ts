import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { readGameConfig } from "@/lib/territories/configStore";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ customerNumber: string }> }) {
  const { customerNumber } = await params;
  const body = (await request.json()) as { tier: string; note?: string };

  if (!body.tier) {
    return NextResponse.json({ error: "Expected a tier id" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("territories_potentials")
    .upsert(
      { customer_number: customerNumber, tier: body.tier, note: body.note ?? "", set_at: new Date().toISOString() },
      { onConflict: "customer_number" },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const config = await readGameConfig();
  return NextResponse.json(config);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ customerNumber: string }> }) {
  const { customerNumber } = await params;
  const supabase = createAdminClient();
  const { error } = await supabase.from("territories_potentials").delete().eq("customer_number", customerNumber);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const config = await readGameConfig();
  return NextResponse.json(config);
}
