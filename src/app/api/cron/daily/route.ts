import { NextRequest, NextResponse } from "next/server";
import { runDailyPipeline } from "@/lib/pipeline";

// Observed up to ~70s locally against the full invoice set — request the max duration
// Vercel's plan allows so a slow run doesn't get killed mid-pipeline.
export const maxDuration = 60;

// Vercel Cron hits this with `Authorization: Bearer $CRON_SECRET` (no user session) —
// this route authenticates itself rather than relying on the session-based middleware,
// which is why /api/cron is exempted from that check in middleware.ts.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDailyPipeline();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
