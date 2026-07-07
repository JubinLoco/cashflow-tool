import { NextRequest, NextResponse } from "next/server";
import { storeTokens } from "@/lib/fortnox/tokens";

const FORTNOX_TOKEN_URL = "https://apps.fortnox.se/oauth-v1/token";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const storedState = request.cookies.get("fortnox_oauth_state")?.value;

  if (!code || !state || state !== storedState) {
    return NextResponse.json({ error: "Invalid state or missing code" }, { status: 400 });
  }

  const credentials = Buffer.from(
    `${process.env.FORTNOX_CLIENT_ID}:${process.env.FORTNOX_CLIENT_SECRET}`,
  ).toString("base64");

  const tokenResponse = await fetch(FORTNOX_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.FORTNOX_REDIRECT_URI!,
    }),
  });

  if (!tokenResponse.ok) {
    const details = await tokenResponse.text();
    return NextResponse.json({ error: "Token exchange failed", details }, { status: 502 });
  }

  try {
    await storeTokens(await tokenResponse.json());
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  const response = NextResponse.redirect(new URL("/fortnox/connected", request.url));
  response.cookies.delete("fortnox_oauth_state");
  return response;
}
