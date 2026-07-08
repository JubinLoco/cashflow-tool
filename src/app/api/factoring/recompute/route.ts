import { NextResponse } from "next/server";
import { runFactoringPhase } from "@/lib/pipeline";

export const maxDuration = 60;

export async function GET() {
  try {
    return NextResponse.json(await runFactoringPhase());
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
