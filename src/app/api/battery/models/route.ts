import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("battery_models")
    .select("*")
    .order("article_description", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest) {
  const supabase = createAdminClient();
  const { article_number, weight_kg } = (await request.json()) as { article_number: string; weight_kg: number | null };

  const { error } = await supabase.from("battery_models").update({ weight_kg }).eq("article_number", article_number);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
