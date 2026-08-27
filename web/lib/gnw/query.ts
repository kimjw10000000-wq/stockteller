import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  WIRE_NEWS_MAX_PAGES,
  WIRE_NEWS_PAGE_SIZE,
} from "@/lib/gnw/nav";
import type { WireNewsRow } from "@/lib/gnw/types";
import { loadAllTickerQuotes } from "@/lib/quotes/ticker-quotes";
import type { TickerQuoteMap } from "@/lib/quotes/types";

export { WIRE_NEWS_MAX_PAGES, WIRE_NEWS_PAGE_SIZE } from "@/lib/gnw/nav";
export type { WireNewsFilter } from "@/lib/gnw/nav";
export { newsSecHref, parseWireNewsFilter, parseWireNewsPage } from "@/lib/gnw/nav";

const WIRE_NEWS_COLUMNS =
  "id,source,external_id,url,title,teaser,summary,sentiment,analysis_score,tickers,primary_ticker,company_name,published_at,created_at,market_cap,cap_bucket,language,llm_model";

export type WireNewsPage = {
  items: WireNewsRow[];
  page: number;
  totalPages: number;
  total: number;
};

const MOVER_LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000;
const MOVER_FETCH_LIMIT = 500;

function publicClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return null;
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function loadWireNews(limit = WIRE_NEWS_PAGE_SIZE): Promise<WireNewsRow[]> {
  const client = publicClient();
  if (!client) return [];

  const { data, error } = await client
    .from("wire_news")
    .select(WIRE_NEWS_COLUMNS)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(Math.max(1, Math.min(limit, WIRE_NEWS_PAGE_SIZE * WIRE_NEWS_MAX_PAGES)));

  if (error) {
    console.error("[loadWireNews]", error.message);
    return [];
  }

  return (data ?? []) as WireNewsRow[];
}

export async function loadWireNewsPage(requestedPage: number): Promise<WireNewsPage> {
  const empty: WireNewsPage = { items: [], page: 1, totalPages: 1, total: 0 };
  const client = publicClient();
  if (!client) return empty;

  const { count, error: countError } = await client
    .from("wire_news")
    .select("id", { count: "exact", head: true });

  if (countError) {
    console.error("[loadWireNewsPage]", countError.message);
    return empty;
  }

  const total = Math.min(count ?? 0, WIRE_NEWS_PAGE_SIZE * WIRE_NEWS_MAX_PAGES);
  const totalPages = Math.max(1, Math.ceil(total / WIRE_NEWS_PAGE_SIZE));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  if (total === 0) return { ...empty, totalPages };

  const from = (page - 1) * WIRE_NEWS_PAGE_SIZE;
  const to = from + WIRE_NEWS_PAGE_SIZE - 1;
  const { data, error } = await client
    .from("wire_news")
    .select(WIRE_NEWS_COLUMNS)
    .order("published_at", { ascending: false, nullsFirst: false })
    .range(from, to);

  if (error) {
    console.error("[loadWireNewsPage]", error.message);
    return { items: [], page, totalPages, total };
  }

  return { items: (data ?? []) as WireNewsRow[], page, totalPages, total };
}

export async function loadWireNewsMoversPage(
  requestedPage: number,
  direction: "gainers" | "losers"
): Promise<WireNewsPage> {
  const empty: WireNewsPage = { items: [], page: 1, totalPages: 1, total: 0 };
  const client = publicClient();
  if (!client) return empty;

  const since = new Date(Date.now() - MOVER_LOOKBACK_MS).toISOString();
  const { data, error } = await client
    .from("wire_news")
    .select(WIRE_NEWS_COLUMNS)
    .gte("published_at", since)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(MOVER_FETCH_LIMIT);

  if (error) {
    console.error("[loadWireNewsMoversPage]", error.message);
    return empty;
  }

  const rows = (data ?? []) as WireNewsRow[];
  const quotes = await loadAllTickerQuotes();
  const movers = rows.filter((row) => {
    const pct = quotePct(quotes, row);
    if (pct == null) return false;
    return direction === "gainers" ? pct > 0 : pct < 0;
  });
  const ranked = movers.sort((a, b) => {
    const pa = quotePct(quotes, a) ?? 0;
    const pb = quotePct(quotes, b) ?? 0;
    const diff = direction === "gainers" ? pb - pa : pa - pb;
    if (diff !== 0) return diff;
    return publishedMs(b) - publishedMs(a);
  });

  const total = Math.min(ranked.length, WIRE_NEWS_PAGE_SIZE * WIRE_NEWS_MAX_PAGES);
  const totalPages = Math.max(1, Math.ceil(total / WIRE_NEWS_PAGE_SIZE));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  if (total === 0) return { ...empty, totalPages };

  const from = (page - 1) * WIRE_NEWS_PAGE_SIZE;
  return {
    items: ranked.slice(from, from + WIRE_NEWS_PAGE_SIZE),
    page,
    totalPages,
    total,
  };
}

function quotePct(quotes: TickerQuoteMap, item: WireNewsRow): number | null {
  const ticker = (item.primary_ticker || item.tickers?.[0] || "").trim().toUpperCase();
  if (!ticker) return null;
  const pct = quotes[ticker]?.changePct;
  return pct == null || !Number.isFinite(pct) ? null : pct;
}

function publishedMs(item: WireNewsRow): number {
  const raw = item.published_at || item.created_at;
  if (!raw) return 0;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : 0;
}

export async function loadWireNewsById(id: string): Promise<WireNewsRow | null> {
  const client = publicClient();
  if (!client || !id.trim()) return null;

  const { data, error } = await client
    .from("wire_news")
    .select(WIRE_NEWS_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[loadWireNewsById]", error.message);
    return null;
  }

  return (data as WireNewsRow | null) ?? null;
}
