import { NextRequest, NextResponse } from "next/server";
import { syncCustomerInvoices } from "@/lib/sync/customerInvoices";
import { syncSupplierInvoices } from "@/lib/sync/supplierInvoices";
import { computePaymentDelayStats } from "@/lib/factoring/paymentDelayStats";
import { reallocateFactoring } from "@/lib/factoring/reallocate";
import { generateCashEvents } from "@/lib/factoring/cashEvents";
import { reconcileSalesForecast, reconcilePurchaseForecast } from "@/lib/forecast/reconcile";

// Vercel Cron hits this with `Authorization: Bearer $CRON_SECRET` (no user session) —
// this route authenticates itself rather than relying on the session-based middleware,
// which is why /api/cron is exempted from that check in middleware.ts.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const customerInvoices = await syncCustomerInvoices();
    const supplierInvoices = await syncSupplierInvoices();
    const paymentDelayStats = await computePaymentDelayStats();
    const reallocation = await reallocateFactoring();
    const cashEvents = await generateCashEvents();
    const salesReconciled = await reconcileSalesForecast();
    const purchasesReconciled = await reconcilePurchaseForecast();

    return NextResponse.json({
      customerInvoices,
      supplierInvoices,
      paymentDelayStats,
      reallocation,
      cashEvents,
      salesReconciled,
      purchasesReconciled,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
