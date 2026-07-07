import { NextResponse } from "next/server";
import { syncCustomerInvoices } from "@/lib/sync/customerInvoices";
import { syncSupplierInvoices } from "@/lib/sync/supplierInvoices";

export async function GET() {
  try {
    const customerInvoices = await syncCustomerInvoices();
    const supplierInvoices = await syncSupplierInvoices();
    return NextResponse.json({ customerInvoices, supplierInvoices });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
