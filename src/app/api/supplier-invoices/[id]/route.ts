import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// manual_paid is never touched by the Fortnox sync (its upsert payload omits the column),
// so an override set here persists across syncs until explicitly cleared.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { manual_paid } = (await request.json()) as { manual_paid: boolean | null };

  const supabase = createAdminClient();
  const { error } = await supabase.from("supplier_invoices").update({ manual_paid }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
