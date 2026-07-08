import { syncCustomerInvoices } from "@/lib/sync/customerInvoices";
import { syncSupplierInvoices } from "@/lib/sync/supplierInvoices";
import { computePaymentDelayStats } from "@/lib/factoring/paymentDelayStats";
import { reallocateFactoring } from "@/lib/factoring/reallocate";
import { generateCashEvents } from "@/lib/factoring/cashEvents";
import { reconcileSalesForecast, reconcilePurchaseForecast } from "@/lib/forecast/reconcile";
import { getValidAccessToken } from "@/lib/fortnox/tokens";

// Split into three phases — sync, factoring, reconcile — because running all of them in
// a single request occasionally exceeded Vercel's function timeout (observed up to 69s
// combined, hit a hard 60s FUNCTION_INVOCATION_TIMEOUT in production). Each phase alone
// stays comfortably within budget. Used by both the CRON_SECRET-authenticated
// /api/cron/* routes (staggered in vercel.json) and the session-authenticated routes
// the manual "Sync now" button calls in sequence.
export async function runSyncPhase() {
  // Warm the token once before running both syncs concurrently — if the token happened
  // to need a refresh, doing that serially first avoids both syncs racing to refresh the
  // same (single-use, rotating) refresh token at once.
  await getValidAccessToken();
  const [customerInvoices, supplierInvoices] = await Promise.all([syncCustomerInvoices(), syncSupplierInvoices()]);
  return { customerInvoices, supplierInvoices };
}

export async function runFactoringPhase() {
  const paymentDelayStats = await computePaymentDelayStats();
  const reallocation = await reallocateFactoring();
  const cashEvents = await generateCashEvents();
  return { paymentDelayStats, reallocation, cashEvents };
}

export async function runReconcilePhase() {
  const salesReconciled = await reconcileSalesForecast();
  const purchasesReconciled = await reconcilePurchaseForecast();
  return { salesReconciled, purchasesReconciled };
}
