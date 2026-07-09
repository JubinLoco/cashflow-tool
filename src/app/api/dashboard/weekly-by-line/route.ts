import { NextResponse } from "next/server";
import { computeWeeklyByLine } from "@/lib/dashboard/weeklyByLine";

export async function GET() {
  try {
    const result = await computeWeeklyByLine(8, 8);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
