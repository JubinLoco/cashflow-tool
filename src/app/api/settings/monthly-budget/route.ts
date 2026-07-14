import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetchAll";

export async function GET() {
  const supabase = createAdminClient();
  const rows = await fetchAllRows<{ month: string; turnover: number; cogs: number; opex: number }>((from, to) =>
    supabase.from("monthly_budget").select("month, turnover, cogs, opex").order("month", { ascending: true }).range(from, to),
  );
  return NextResponse.json(rows);
}

export async function PATCH(request: NextRequest) {
  const supabase = createAdminClient();
  const { month, turnover, cogs, opex } = (await request.json()) as {
    month: string;
    turnover: number;
    cogs: number;
    opex: number;
  };

  const { error } = await supabase.from("monthly_budget").upsert({ month, turnover, cogs, opex }, { onConflict: "month" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
