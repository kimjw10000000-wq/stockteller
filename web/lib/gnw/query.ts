import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { WireNewsRow } from "@/lib/gnw/types";

const WIRE_NEWS_COLUMNS =
  "id,source,external_id,url,title,teaser,summary,sentiment,analysis_score,tickers,primary_ticker,company_name,published_at,created_at,market_cap,cap_bucket,language,llm_model";

export const WIRE_NEWS_PAGE_SIZE = 16;
export const WIRE_NEWS_MAX_PAGES = 10;

export type WireNewsPage = {
  items: WireNewsRow[];
  page: number;
  totalPages: number;
  total: number;
};

function publicClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return null;
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function parseWireNewsPage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number.parseInt(value ?? "1", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(WIRE_NEWS_MAX_PAGES, n);
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
