import { syncCustomerInvoices } from "@/lib/sync/customerInvoices";
import { syncSupplierInvoices } from "@/lib/sync/supplierInvoices";
import { computePaymentDelayStats } from "@/lib/factoring/paymentDelayStats";
import { reallocateFactoring } from "@/lib/factoring/reallocate";
import { generateCashEvents } from "@/lib/factoring/cashEvents";
import { reconcileSalesForecast, reconcilePurchaseForecast } from "@/lib/forecast/reconcile";

// The full daily refresh: pull new/changed invoices, recompute factoring, then
// reconcile forecasts against what just synced. Shared by the Vercel cron route and
// the session-authenticated manual "Sync now" route so both stay in lockstep.
export async function runDailyPipeline() {
  const customerInvoices = await syncCustomerInvoices();
  const supplierInvoices = await syncSupplierInvoices();
  const paymentDelayStats = await computePaymentDelayStats();
  const reallocation = await reallocateFactoring();
  const cashEvents = await generateCashEvents();
  const salesReconciled = await reconcileSalesForecast();
  const purchasesReconciled = await reconcilePurchaseForecast();

  return {
    customerInvoices,
    supplierInvoices,
    paymentDelayStats,
    reallocation,
    cashEvents,
    salesReconciled,
    purchasesReconciled,
  };
}
