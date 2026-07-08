import { getValidAccessToken } from "@/lib/fortnox/tokens";

const BASE_URL = "https://api.fortnox.se/3";
// Fortnox allows 25 requests / 5 seconds. Fetching pages in concurrent batches (rather
// than one at a time) matters because Fortnox's own response time is highly variable in
// practice (observed 19s-4min for the same ~11-page sync) — sequential fetching means
// wall-clock time is fully exposed to that variability, which was pushing production
// past Vercel's 60s function timeout even after removing redundant token checks.
const CONCURRENCY = 10;

type FortnoxListResponse<TKey extends string, TItem> = {
  MetaInformation: { "@TotalResources": number; "@TotalPages": number; "@CurrentPage": number };
} & { [K in TKey]: TItem[] };

async function fortnoxGetPage<TKey extends string, TItem>(
  accessToken: string,
  path: string,
  page: number,
): Promise<FortnoxListResponse<TKey, TItem>> {
  const qs = new URLSearchParams({ limit: "500", page: String(page) });
  const response = await fetch(`${BASE_URL}${path}?${qs}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Fortnox GET ${path} failed (${response.status}): ${await response.text()}`);
  }
  return response.json();
}

// Fortnox caps page size at 500 — yields one page's items at a time so the caller can
// upsert incrementally. Fetches page 1 first to learn the total page count, then fetches
// the rest in concurrent batches of CONCURRENCY, yielding each batch's results in order.
export async function* fortnoxPaginate<TKey extends string, TItem>(
  path: string,
  listKey: TKey,
): AsyncGenerator<TItem[]> {
  const accessToken = await getValidAccessToken();

  const first = await fortnoxGetPage<TKey, TItem>(accessToken, path, 1);
  yield first[listKey];

  const totalPages = first.MetaInformation["@TotalPages"];
  for (let start = 2; start <= totalPages; start += CONCURRENCY) {
    const pages = [];
    for (let p = start; p < start + CONCURRENCY && p <= totalPages; p++) pages.push(p);
    const results = await Promise.all(pages.map((page) => fortnoxGetPage<TKey, TItem>(accessToken, path, page)));
    for (const r of results) yield r[listKey];
  }
}
