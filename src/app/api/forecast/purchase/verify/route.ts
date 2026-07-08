import { NextRequest, NextResponse } from "next/server";
import { buildVerificationList } from "@/lib/forecast/verify";

export async function GET(request: NextRequest) {
  const monthsBack = Number(request.nextUrl.searchParams.get("monthsBack") ?? "2");
  const monthsForward = Number(request.nextUrl.searchParams.get("monthsForward") ?? "6");
  const today = new Date();
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - monthsBack, 1));
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + monthsForward + 1, 1));

  try {
    const rows = await buildVerificationList(
      "purchase_forecast",
      "supplier_invoices",
      start.toISOString().slice(0, 10),
      end.toISOString().slice(0, 10),
    );
    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
