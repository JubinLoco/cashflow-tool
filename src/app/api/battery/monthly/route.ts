import { NextResponse } from "next/server";
import { computeMonthlyBatteryWeights } from "@/lib/battery/monthlyWeights";

export async function GET() {
  const data = await computeMonthlyBatteryWeights();
  return NextResponse.json(data);
}
