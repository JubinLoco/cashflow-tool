import { NextRequest, NextResponse } from "next/server";
import { runLedgerSyncPhase } from "@/lib/pipeline";
import { isCronAuthorized } from "@/lib/cronAuth";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await runLedgerSyncPhase());
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
