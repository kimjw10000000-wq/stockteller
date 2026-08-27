import { createClient } from "@supabase/supabase-js";
import type { WireNewsRow } from "@/lib/gnw/types";

export async function loadWireNews(): Promise<WireNewsRow[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return [];

  const client = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client
    .from("wire_news")
    .select(
      "id,source,external_id,url,title,teaser,summary,sentiment,analysis_score,tickers,primary_ticker,company_name,published_at,created_at,market_cap,cap_bucket,language,llm_model"
    )
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(20);

  if (error) {
    console.error("[loadWireNews]", error.message);
    return [];
  }

  return (data ?? []) as WireNewsRow[];
}
