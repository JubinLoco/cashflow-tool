import { NextRequest, NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/fortnox/tokens";

export async function GET(request: NextRequest) {
  const resource = request.nextUrl.searchParams.get("resource") ?? "invoices";
  const limit = request.nextUrl.searchParams.get("limit") ?? "5";
  const page = request.nextUrl.searchParams.get("page");

  try {
    const accessToken = await getValidAccessToken();
    const qs = new URLSearchParams({ limit, ...(page ? { page } : {}) });
    const response = await fetch(`https://api.fortnox.se/3/${resource}?${qs}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
