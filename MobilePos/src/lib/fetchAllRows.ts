// Supabase/PostgREST caps every response (1000 rows by default). Reports that
// sum a month or a year of orders must read every page, or totals are
// silently wrong for busy shops.

export const PAGE_SIZE = 1000;
const MAX_PAGES = 200; // hard stop at 200k rows

interface RangeableQuery<T> {
  range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>;
}

/**
 * Runs `makeQuery()` page by page until a short page is returned.
 * `makeQuery` must build a fresh query each call and include a stable
 * `.order(...)` so pages do not overlap.
 */
export async function fetchAllRows<T>(makeQuery: () => RangeableQuery<T>, pageSize = PAGE_SIZE): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * pageSize;
    const { data, error } = await makeQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) return rows;
  }
  throw new Error(`Too many rows to load (more than ${MAX_PAGES * pageSize}). Narrow the date range.`);
}
