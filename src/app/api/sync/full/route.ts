import { NextResponse } from "next/server";
import { runDailyPipeline } from "@/lib/pipeline";

// Observed up to ~70s locally against the full invoice set — request the max duration
// Vercel's plan allows so a slow run doesn't get killed mid-pipeline.
export const maxDuration = 60;

// Same pipeline as the daily cron, but reachable by a logged-in user (auth middleware
// already protects this route) for an on-demand "Sync now" button.
export async function GET() {
  try {
    const result = await runDailyPipeline();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
