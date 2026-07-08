import { NextResponse } from "next/server";
import { runSyncPhase } from "@/lib/pipeline";

export const maxDuration = 60;

export async function GET() {
  try {
    return NextResponse.json(await runSyncPhase());
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
