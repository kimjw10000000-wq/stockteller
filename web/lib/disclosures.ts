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
const QUERY_TIMEOUT_MS = 4000;

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

export async function listDisclosuresPaginated(
  opts: ListDisclosuresOptions = {}
): Promise<ListDisclosuresResult> {
  const sort = opts.sort ?? "latest";
  const market = opts.market ?? "all";
  const limit = opts.limit ?? 20;
  const qLower = opts.q?.trim().toLowerCase() ?? "";

  let supabase;
  try {
    supabase = createPublicClient();
  } catch {
    return { items: [], nextCursor: null };
  }

  const buildQuery = (useViewSort: boolean) => {
    let q = supabase.from("disclosures").select(SELECT);
    if (opts.excludeId) q = q.neq("id", opts.excludeId);
    if (opts.cursor) q = q.lt("created_at", opts.cursor);

    if (useViewSort && sort === "all_views") {
      q = q.order("view_count", { ascending: false }).order("created_at", { ascending: false });
    } else if (useViewSort && sort === "hour_views") {
      q = q.order("views_1h", { ascending: false }).order("created_at", { ascending: false });
    } else {
      q = q.order("created_at", { ascending: false }).order("id", { ascending: false });
    }
    return q.limit(Math.min(limit * 4, 80));
  };

  const first = await withQueryTimeout(() => buildQuery(sort !== "latest"), QUERY_TIMEOUT_MS);
  if (first === "timeout") {
    return { items: [], nextCursor: null };
  }

  let { data, error } = first;

  if (error && (sort === "all_views" || sort === "hour_views")) {
    const retry = await withQueryTimeout(() => buildQuery(false), QUERY_TIMEOUT_MS);
    if (retry === "timeout") return { items: [], nextCursor: null };
    ({ data, error } = retry);
  }

  if (error) {
    console.error("[listDisclosuresPaginated]", error.message);
    return { items: [], nextCursor: null };
  }

  let items = (data ?? []) as DisclosureWithStock[];
  items = items.filter((item) => matchesMarketFilter(item, market));
  if (qLower) items = items.filter((item) => matchesStockSearchQuery(item, qLower));
  items = items.slice(0, limit);

  const nextCursor =
    items.length === limit ? items[items.length - 1]?.created_at ?? null : null;

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
