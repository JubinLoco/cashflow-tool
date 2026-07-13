import { NextRequest, NextResponse } from "next/server";
import { deleteForecastEntry, updateForecastEntry } from "@/lib/forecast/entries";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scope = request.nextUrl.searchParams.get("scope") === "future" ? "future" : "single";

  try {
    await deleteForecastEntry("sales_forecast", id, scope);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scope = request.nextUrl.searchParams.get("scope") === "future" ? "future" : "single";
  const body = await request.json();
  const { description, amount, expected_date, product_line, status } = body as {
    description?: string;
    amount?: number;
    expected_date?: string;
    product_line?: "gmax_ci" | "residential" | "consultancy";
    status?: "dropped";
  };

  const extra = {
    ...(product_line !== undefined ? { product_line } : {}),
    ...(status !== undefined ? { status } : {}),
  };

  try {
    await updateForecastEntry("sales_forecast", id, scope, {
      description,
      amount,
      expected_date,
      extra: Object.keys(extra).length > 0 ? extra : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
