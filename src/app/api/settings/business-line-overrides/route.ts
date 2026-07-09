import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("sales_business_line_overrides")
    .select("*")
    .order("fortnox_doc_number", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const supabase = createAdminClient();
  const body = await request.json();
  const { fortnox_doc_number, business_line } = body as {
    fortnox_doc_number: string;
    business_line: "residential" | "gmax_ci" | "consultancy";
  };

  const { data, error } = await supabase
    .from("sales_business_line_overrides")
    .upsert({ fortnox_doc_number, business_line }, { onConflict: "fortnox_doc_number" })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
