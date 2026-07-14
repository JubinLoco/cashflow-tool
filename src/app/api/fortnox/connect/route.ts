import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

const FORTNOX_AUTH_URL = "https://apps.fortnox.se/oauth-v1/auth";
// bookkeeping added for Track 2 (ledger sync — Vouchers/Accounts for the monthly P&L).
const SCOPES = "invoice supplierinvoice customer supplier bookkeeping";

export async function GET() {
  const state = randomBytes(16).toString("hex");

  const params = new URLSearchParams({
    client_id: process.env.FORTNOX_CLIENT_ID!,
    redirect_uri: process.env.FORTNOX_REDIRECT_URI!,
    scope: SCOPES,
    state,
    access_type: "offline",
    response_type: "code",
  });

  const response = NextResponse.redirect(`${FORTNOX_AUTH_URL}?${params.toString()}`);
  response.cookies.set("fortnox_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
