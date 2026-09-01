import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isSameEtDay } from "./prev-close";
import { hideSplitDistortedPct } from "./split-adjusted";
import type { TickerQuote, TickerQuoteMap } from "./types";

const COLUMNS = "ticker,last_price,change_pct,currency,fetched_at";

function publicClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return null;
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function normalizeTickers(tickers: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tickers) {
    const ticker = raw.trim().toUpperCase();
    if (!ticker || seen.has(ticker)) continue;
    seen.add(ticker);
    out.push(ticker);
  }
  return out.slice(0, 200);
}

function rowToQuote(row: {
  ticker?: string;
  last_price?: number | string | null;
  change_pct?: number | string | null;
  currency?: string | null;
  fetched_at?: string | null;
}): TickerQuote | null {
  const ticker = (row.ticker ?? "").trim().toUpperCase();
  if (!ticker) return null;
  const last = row.last_price == null ? null : Number(row.last_price);
  const lastPrice = last != null && Number.isFinite(last) ? last : null;
  const pct = row.change_pct == null ? null : Number(row.change_pct);
  const rawPct = pct != null && Number.isFinite(pct) ? pct : null;
  const freshPct = isSameEtDay(row.fetched_at) ? rawPct : null;
  return {
    ticker,
    lastPrice,
    changePct: hideSplitDistortedPct(freshPct, lastPrice),
    currency: row.currency ?? null,
    fetchedAt: row.fetched_at ?? null,
  };
}

export async function loadAllTickerQuotes(): Promise<TickerQuoteMap> {
  const client = publicClient();
  if (!client) return {};

  const { data, error } = await client
    .from("ticker_quotes")
    .select(COLUMNS)
    .order("fetched_at", { ascending: false })
    .limit(500);
  if (error) {
    console.error("[loadAllTickerQuotes]", error.message);
    return {};
  }

  const map: TickerQuoteMap = {};
  for (const row of data ?? []) {
    const quote = rowToQuote(row);
    if (quote) map[quote.ticker] = quote;
  }
  return map;
}

export async function loadTickerQuotes(tickers: string[]): Promise<TickerQuoteMap> {
  const list = normalizeTickers(tickers);
  if (!list.length) return {};
  const client = publicClient();
  if (!client) return {};

  const { data, error } = await client.from("ticker_quotes").select(COLUMNS).in("ticker", list);
  if (error) {
    console.error("[loadTickerQuotes]", error.message);
    return {};
  }

  const map: TickerQuoteMap = {};
  for (const row of data ?? []) {
    const quote = rowToQuote(row);
    if (quote) map[quote.ticker] = quote;
  }
  return map;
}

export async function upsertTickerQuotes(
  client: SupabaseClient,
  quotes: TickerQuote[]
): Promise<number> {
  if (!quotes.length) return 0;
  const rows = quotes.map((q) => ({
    ticker: q.ticker.trim().toUpperCase(),
    last_price: q.lastPrice,
    change_pct: q.changePct,
    currency: q.currency,
    fetched_at: q.fetchedAt ?? new Date().toISOString(),
  }));
  const { error } = await client.from("ticker_quotes").upsert(rows, { onConflict: "ticker" });
  if (error) throw error;
  return rows.length;
}
