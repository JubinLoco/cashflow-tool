import { NextResponse } from "next/server";
import { computeForecastVsActual } from "@/lib/dashboard/forecastVsActual";

export async function GET() {
  try {
    const result = await computeForecastVsActual(6, 6);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
