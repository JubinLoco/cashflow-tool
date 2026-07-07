import { createAdminClient } from "@/lib/supabase/admin";

const FORTNOX_TOKEN_URL = "https://apps.fortnox.se/oauth-v1/token";

function basicAuthHeader() {
  const credentials = Buffer.from(
    `${process.env.FORTNOX_CLIENT_ID}:${process.env.FORTNOX_CLIENT_SECRET}`,
  ).toString("base64");
  return `Basic ${credentials}`;
}

type FortnoxTokenResponse = {
  access_token: string;
  refresh_token: string;
  scope: string;
  expires_in: number;
};

export async function storeTokens(tokenData: FortnoxTokenResponse) {
  const supabase = createAdminClient();
  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

  // Only one Fortnox connection is supported right now — replace whatever was there.
  await supabase.from("fortnox_tokens").delete().not("id", "is", null);

  const { error } = await supabase.from("fortnox_tokens").insert({
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    scope: tokenData.scope,
    expires_at: expiresAt,
  });

  if (error) throw new Error(`Failed to store Fortnox tokens: ${error.message}`);
}

export async function getValidAccessToken(): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("fortnox_tokens")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    throw new Error("No Fortnox connection found — visit /api/fortnox/connect first");
  }

  const msUntilExpiry = new Date(data.expires_at).getTime() - Date.now();
  if (msUntilExpiry > 60_000) {
    return data.access_token;
  }

  // Fortnox rotates the refresh token on every use — the new one must be
  // stored immediately or the next refresh will fail.
  const response = await fetch(FORTNOX_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(),
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: data.refresh_token,
    }),
  });

  if (!response.ok) {
    throw new Error(`Fortnox token refresh failed: ${await response.text()}`);
  }

  const refreshed: FortnoxTokenResponse = await response.json();
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

  await supabase
    .from("fortnox_tokens")
    .update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      scope: refreshed.scope,
      expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", data.id);

  return refreshed.access_token;
}
