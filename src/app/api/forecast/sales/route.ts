import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createForecastEntries, type DateInput } from "@/lib/forecast/entries";

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("sales_forecast")
    .select("*")
    .order("expected_date", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { description, product_line, amount, probability, dateInput } = body as {
    description: string;
    product_line: "gmax_ci" | "residential";
    amount: number;
    probability?: number;
    dateInput: DateInput;
  };

  try {
    const rows = await createForecastEntries(
      "sales_forecast",
      { description, product_line, amount, probability: probability ?? 1.0 },
      dateInput,
    );
    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
