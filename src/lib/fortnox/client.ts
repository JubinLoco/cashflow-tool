import { getValidAccessToken } from "@/lib/fortnox/tokens";

const BASE_URL = "https://api.fortnox.se/3";

type FortnoxListResponse<TKey extends string, TItem> = {
  MetaInformation: { "@TotalResources": number; "@TotalPages": number; "@CurrentPage": number };
} & { [K in TKey]: TItem[] };

async function fortnoxGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const accessToken = await getValidAccessToken();
  const qs = new URLSearchParams(params);
  const response = await fetch(`${BASE_URL}${path}?${qs}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Fortnox GET ${path} failed (${response.status}): ${await response.text()}`);
  }
  return response.json();
}

// Fortnox caps page size at 500 — yields one page (array of items) at a time
// so the caller can upsert incrementally instead of holding everything in memory.
export async function* fortnoxPaginate<TKey extends string, TItem>(
  path: string,
  listKey: TKey,
): AsyncGenerator<TItem[]> {
  let page = 1;
  while (true) {
    const data = await fortnoxGet<FortnoxListResponse<TKey, TItem>>(path, {
      limit: "500",
      page: String(page),
    });
    yield data[listKey];
    if (page >= data.MetaInformation["@TotalPages"]) break;
    page++;
  }
}
