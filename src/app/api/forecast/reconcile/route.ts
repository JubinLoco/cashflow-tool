import { NextResponse } from "next/server";
import { reconcileSalesForecast, reconcilePurchaseForecast } from "@/lib/forecast/reconcile";

export async function GET() {
  try {
    const sales = await reconcileSalesForecast();
    const purchases = await reconcilePurchaseForecast();
    return NextResponse.json({ sales, purchases });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
