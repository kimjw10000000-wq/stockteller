import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { WireNewsRow } from "@/lib/gnw/types";

const WIRE_NEWS_COLUMNS =
  "id,source,external_id,url,title,teaser,summary,sentiment,analysis_score,tickers,primary_ticker,company_name,published_at,created_at,market_cap,cap_bucket,language,llm_model";

function publicClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return null;
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function loadWireNews(): Promise<WireNewsRow[]> {
  const client = publicClient();
  if (!client) return [];

  const { data, error } = await client
    .from("wire_news")
    .select(WIRE_NEWS_COLUMNS)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(20);

  if (error) {
    console.error("[loadWireNews]", error.message);
    return [];
  }

  return (data ?? []) as WireNewsRow[];
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
