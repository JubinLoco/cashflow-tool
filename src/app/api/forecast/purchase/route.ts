import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createForecastEntries, type DateInput } from "@/lib/forecast/entries";

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("purchase_forecast")
    .select("*")
    .order("expected_date", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { description, category, amount, dateInput } = body as {
    description: string;
    category: string;
    amount: number;
    dateInput: DateInput;
  };

  try {
    const rows = await createForecastEntries("purchase_forecast", { description, category, amount }, dateInput);
    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
