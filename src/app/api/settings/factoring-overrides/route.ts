import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("factoring_manual_overrides")
    .select("*")
    .order("noted_date", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const supabase = createAdminClient();
  const body = await request.json();
  const { fortnox_doc_number, reason_code, reason_description, treatment } = body as {
    fortnox_doc_number: string;
    reason_code?: string;
    reason_description?: string;
    treatment: "exclude_entirely" | "full_amount_on_payment";
  };

  const { data, error } = await supabase
    .from("factoring_manual_overrides")
    .insert({ fortnox_doc_number, reason_code, reason_description, treatment })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
