import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE(request: Request, { params }: { params: Promise<{ fortnoxDocNumber: string }> }) {
  const { fortnoxDocNumber } = await params;
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("sales_business_line_overrides")
    .delete()
    .eq("fortnox_doc_number", fortnoxDocNumber);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
