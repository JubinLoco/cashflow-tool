import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Removing a model means "this was never actually a battery" (a false positive from the
// name-pattern match) -- also drops its tracked sale lines, so the monthly rollup doesn't
// keep showing a lingering "unknown model" row for it.
export async function DELETE(request: Request, { params }: { params: Promise<{ articleNumber: string }> }) {
  const { articleNumber } = await params;
  const supabase = createAdminClient();

  const { error: linesError } = await supabase.from("battery_sale_lines").delete().eq("article_number", articleNumber);
  if (linesError) return NextResponse.json({ error: linesError.message }, { status: 500 });

  const { error } = await supabase.from("battery_models").delete().eq("article_number", articleNumber);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
