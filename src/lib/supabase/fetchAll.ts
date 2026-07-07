const PAGE_SIZE = 1000;

type RangedResult<T> = { data: T[] | null; error: { message: string } | null };

// Supabase/PostgREST caps unranged selects at a default max-rows setting (1000 here) —
// anything reading a potentially large table must page through with .range().
export async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<RangedResult<T>>,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await buildQuery(from, to);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return all;
}
