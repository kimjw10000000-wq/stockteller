import type { DisclosureWithStock } from "@/lib/types";
import { createPublicClient } from "@/lib/supabase/public";
import { matchesMarketFilter, matchesStockSearchQuery } from "@/lib/news-display";
import type { NewsMarketKey, NewsSortKey } from "@/lib/news-sort";

export type ListDisclosuresOptions = {
  sort?: NewsSortKey;
  market?: NewsMarketKey;
  q?: string;
  limit?: number;
  /** ISO created_at — 이보다 이전(older) 글만 */
  cursor?: string;
  excludeId?: string;
};

export type ListDisclosuresResult = {
  items: DisclosureWithStock[];
  nextCursor: string | null;
};

const SELECT = "*, stocks(name, ticker, sector, market)";
const QUERY_TIMEOUT_MS = 8000;
/** 시장/검색 필터 시 페이지를 채우기 위해 여러 배치를 이어 조회 */
const MAX_FETCH_ROUNDS = 10;

async function withQueryTimeout<T>(
  run: () => PromiseLike<T>,
  ms: number
): Promise<T | "timeout"> {
  return Promise.race([
    Promise.resolve(run()),
    new Promise<"timeout">((resolve) => {
      setTimeout(() => resolve("timeout"), ms);
    }),
  ]);
}

export async function listDisclosures(limit = 50): Promise<DisclosureWithStock[]> {
  const { items } = await listDisclosuresPaginated({ limit, sort: "latest", market: "all" });
  return items;
}

/**
 * 최신순: created_at DESC (작성/등록 시각 기준 내림차순).
 * 시장·검색 필터는 후처리하되, limit 개수를 채울 때까지 배치를 이어 조회해 빈 목록 버그를 방지.
 */
export async function listDisclosuresPaginated(
  opts: ListDisclosuresOptions = {}
): Promise<ListDisclosuresResult> {
  const sort = opts.sort ?? "latest";
  const market = opts.market ?? "all";
  const limit = opts.limit ?? 20;
  const qLower = opts.q?.trim().toLowerCase() ?? "";
  const needsPostFilter = market !== "all" || !!qLower;

  let supabase;
  try {
    supabase = createPublicClient();
  } catch {
    return { items: [], nextCursor: null };
  }

  const batchSize = needsPostFilter
    ? Math.min(Math.max(limit * 5, 50), 100)
    : Math.min(limit, 40);

  const buildQuery = (useViewSort: boolean, cursor: string | undefined) => {
    let q = supabase.from("disclosures").select(SELECT);
    if (opts.excludeId) q = q.neq("id", opts.excludeId);
    if (cursor) q = q.lt("created_at", cursor);

    if (useViewSort && sort === "all_views") {
      q = q.order("view_count", { ascending: false }).order("created_at", { ascending: false });
    } else if (useViewSort && sort === "hour_views") {
      q = q.order("views_1h", { ascending: false }).order("created_at", { ascending: false });
    } else {
      // 최신순: 작성(등록) 시각 최신 → 과거
      q = q.order("created_at", { ascending: false }).order("id", { ascending: false });
    }
    return q.limit(batchSize);
  };

  async function fetchBatch(
    useViewSort: boolean,
    cursor: string | undefined
  ): Promise<{ data: DisclosureWithStock[] | null; error: { message: string } | null } | "timeout"> {
    const result = await withQueryTimeout(() => buildQuery(useViewSort, cursor), QUERY_TIMEOUT_MS);
    if (result === "timeout") return "timeout";
    return {
      data: (result.data ?? null) as DisclosureWithStock[] | null,
      error: result.error,
    };
  }

  const collected: DisclosureWithStock[] = [];
  const seenIds = new Set<string>();
  let scanCursor = opts.cursor;
  let lastRawCreatedAt: string | null = null;
  let exhausted = false;
  let useViewSort = sort !== "latest";

  for (let round = 0; round < MAX_FETCH_ROUNDS && collected.length < limit; round++) {
    let batch = await fetchBatch(useViewSort, scanCursor);

    if (batch === "timeout") {
      if (collected.length > 0) break;
      console.error("[listDisclosuresPaginated] query timeout");
      return { items: [], nextCursor: null };
    }

    if (batch.error && useViewSort) {
      useViewSort = false;
      batch = await fetchBatch(false, scanCursor);
      if (batch === "timeout") {
        if (collected.length > 0) break;
        return { items: [], nextCursor: null };
      }
    }

    if (batch.error) {
      console.error("[listDisclosuresPaginated]", batch.error.message);
      if (collected.length > 0) break;
      return { items: [], nextCursor: null };
    }

    const raw = batch.data ?? [];
    if (raw.length === 0) {
      exhausted = true;
      break;
    }

    lastRawCreatedAt = raw[raw.length - 1]?.created_at ?? lastRawCreatedAt;
    scanCursor = raw[raw.length - 1]?.created_at ?? scanCursor;

    for (const item of raw) {
      if (seenIds.has(item.id)) continue;
      if (!matchesMarketFilter(item, market)) continue;
      if (qLower && !matchesStockSearchQuery(item, qLower)) continue;
      seenIds.add(item.id);
      collected.push(item);
      if (collected.length >= limit) break;
    }

    if (raw.length < batchSize) {
      exhausted = true;
      break;
    }
  }

  const items = collected.slice(0, limit);
  const nextCursor =
    !exhausted && items.length === limit
      ? items[items.length - 1]?.created_at ?? lastRawCreatedAt
      : null;

  return { items, nextCursor };
}

export async function getDisclosureById(
  id: string
): Promise<DisclosureWithStock | null> {
  let supabase;
  try {
    supabase = createPublicClient();
  } catch {
    return null;
  }
  const { data, error } = await supabase
    .from("disclosures")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[getDisclosureById]", error.message);
    return null;
  }
  return data as DisclosureWithStock | null;
}

/** sitemap용 — 등록된 모든 리포트 id·수정 시각 */
export async function listAllDisclosureSitemapEntries(): Promise<
  { id: string; created_at: string }[]
> {
  let supabase;
  try {
    supabase = createPublicClient();
  } catch {
    return [];
  }

  const entries: { id: string; created_at: string }[] = [];
  let cursor: string | undefined;

  for (let round = 0; round < 100; round += 1) {
    let q = supabase
      .from("disclosures")
      .select("id, created_at")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    if (cursor) q = q.lt("created_at", cursor);

    const result = await withQueryTimeout(() => q.limit(200), QUERY_TIMEOUT_MS);
    if (result === "timeout") break;

    const { data, error } = result;
    if (error) {
      console.error("[listAllDisclosureSitemapEntries]", error.message);
      break;
    }

    const batch = data ?? [];
    if (batch.length === 0) break;

    entries.push(...batch);
    if (batch.length < 200) break;
    cursor = batch[batch.length - 1]?.created_at;
  }

  return entries;
}
