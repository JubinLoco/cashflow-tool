import { NextResponse } from "next/server";
import { computePaymentDelayStats } from "@/lib/factoring/paymentDelayStats";
import { reallocateFactoring } from "@/lib/factoring/reallocate";
import { generateCashEvents } from "@/lib/factoring/cashEvents";

export async function GET() {
  try {
    const paymentDelayStats = await computePaymentDelayStats();
    const reallocation = await reallocateFactoring();
    const cashEvents = await generateCashEvents();
    return NextResponse.json({ paymentDelayStats, reallocation, cashEvents });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
