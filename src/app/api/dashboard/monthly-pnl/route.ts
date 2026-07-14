import { NextResponse } from "next/server";
import { computeMonthlyPnl } from "@/lib/dashboard/monthlyPnl";

export async function GET() {
  try {
    const result = await computeMonthlyPnl(11, 6);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
