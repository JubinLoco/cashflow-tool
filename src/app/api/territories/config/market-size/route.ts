import { NextRequest, NextResponse } from "next/server";
import { MarketSizeCsvError, parseMarketSizeCsv, readMarketSize, replaceMarketSizeMonthly } from "@/lib/territories/marketSize";

export async function GET() {
  const data = await readMarketSize();
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { csv?: string };
  if (!body.csv) {
    return NextResponse.json({ error: "Expected a { csv: string } body with the file's raw text content" }, { status: 400 });
  }

  let rows;
  try {
    rows = parseMarketSizeCsv(body.csv);
  } catch (err) {
    if (err instanceof MarketSizeCsvError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  await replaceMarketSizeMonthly(rows);
  const data = await readMarketSize();
  return NextResponse.json(data);
}
