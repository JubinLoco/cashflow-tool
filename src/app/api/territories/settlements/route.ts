import { NextResponse } from "next/server";
import { readSettlements } from "@/lib/territories/settlementFinancials";

export async function GET() {
  const data = await readSettlements();
  return NextResponse.json(data);
}
