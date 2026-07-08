import { NextRequest, NextResponse } from "next/server";
import { computeProjection, todayISO } from "@/lib/dashboard/projection";

export async function GET(request: NextRequest) {
  const granularity = request.nextUrl.searchParams.get("granularity") === "week" ? "week" : "day";
  const horizonDays = granularity === "week" ? 365 : 90;

  try {
    const result = await computeProjection(todayISO(), horizonDays, granularity);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
