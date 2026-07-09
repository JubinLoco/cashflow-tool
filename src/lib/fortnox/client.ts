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

// Detail fetches run alongside list-page fetches (and the other sync running concurrently
// in the same pipeline phase), so the combined burst can exceed Fortnox's 25 req/5s limit
// even with CONCURRENCY capped per call site — retry on 429 with backoff rather than
// failing the whole sync.
async function fetchWithRetry(url: string, accessToken: string, maxRetries = 8): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    if (response.status !== 429 || attempt >= maxRetries) return response;
    const retryAfter = Number(response.headers.get("Retry-After"));
    // Jitter matters here: concurrent requests that all hit 429 at once would otherwise
    // retry in lockstep and hit the same wall again.
    const jitter = Math.random() * 500;
    const delayMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 + jitter : 1000 * 2 ** attempt + jitter;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

async function fortnoxGetPage<TKey extends string, TItem>(
  accessToken: string,
  path: string,
  page: number,
): Promise<FortnoxListResponse<TKey, TItem>> {
  const qs = new URLSearchParams({ limit: "500", page: String(page) });
  const response = await fetchWithRetry(`${BASE_URL}${path}?${qs}`, accessToken);
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

// Well below CONCURRENCY: this fetch runs alongside the list-page fetches for the same
// resource (and the other invoice sync running concurrently in the same pipeline phase),
// so the combined burst needs its own, smaller share of Fortnox's 25 req/5s budget. In
// practice even 5 was enough to sustain repeated 429s across retries.
const DETAIL_CONCURRENCY = 3;

// The invoice list endpoint only returns headers — gross profit (ContributionValue) and
// row-level article numbers only come back from the per-invoice detail endpoint.
export async function fortnoxGetDetails<TKey extends string, TItem>(
  paths: string[],
  itemKey: TKey,
): Promise<TItem[]> {
  const accessToken = await getValidAccessToken();
  const results: TItem[] = [];
  for (let start = 0; start < paths.length; start += DETAIL_CONCURRENCY) {
    const batch = paths.slice(start, start + DETAIL_CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (path) => {
        const response = await fetchWithRetry(`${BASE_URL}${path}`, accessToken);
        if (!response.ok) {
          throw new Error(`Fortnox GET ${path} failed (${response.status}): ${await response.text()}`);
        }
        const data = (await response.json()) as { [K in TKey]: TItem };
        return data[itemKey];
      }),
    );
    results.push(...batchResults);
  }
  return results;
}
