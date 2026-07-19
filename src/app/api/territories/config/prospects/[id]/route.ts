import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { readGameConfig } from "@/lib/territories/configStore";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { error } = await supabase.from("territories_prospects").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const config = await readGameConfig();
  return NextResponse.json(config);
}
