import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NEWS_SEC_SOURCE_OR } from "@/lib/gnw/query";
import { fetchTossCandlesPage, fetchTossPrices } from "@/lib/toss/market-data";
import { fetchTossRankings } from "@/lib/toss/rankings";
import { tossSafe } from "@/lib/toss/client";
import { priorSessionClose } from "./prev-close";
import { hideSplitDistortedPct, looksLikeUnadjustedReverseSplit } from "./split-adjusted";
import { upsertTickerQuotes } from "./ticker-quotes";
import { etDayKey } from "./poll-window";
import type { TickerQuote } from "./types";

const NEWS_ROW_LIMIT = 500;
const PRICE_CHUNK = 200;
const CANDLES_PER_CYCLE = 5;
const CANDLE_COUNT = 4;
const TICKER_LIST_TTL_MS = 30_000;
const RANKING_TTL_MS = 60_000;
const MOVER_LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000;

const prevClose = new Map<string, number>();
const unknownToToss = new Set<string>();
let sessionDay = "";
let tickerCache: { at: number; tickers: string[] } | null = null;
let rankingBaseCache: { at: number; map: Map<string, number> } | null = null;
let candleCursor = 0;

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} 미설정`);
  return v;
}

function adminClient(): SupabaseClient {
  return createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function roundPct(n: number): number {
  return Math.round(n * 100) / 100;
}

function dropSplitPct(
  ticker: string,
  pct: number | null,
  last: number | null,
  base?: number | null
): number | null {
  const cleaned = hideSplitDistortedPct(pct, last, base);
  if (pct != null && cleaned == null) prevClose.delete(ticker);
  return cleaned;
}

function rollSession(now: Date): void {
  const day = etDayKey(now);
  if (sessionDay && day !== sessionDay) prevClose.clear();
  sessionDay = day;
}

function applyPct(last: number | null, prev: number | undefined, ticker: string): number | null {
  if (last == null || prev == null || prev === 0) return null;
  return dropSplitPct(ticker, roundPct(((last - prev) / prev) * 100), last, prev);
}

async function loadRecentNewsTickers(): Promise<string[]> {
  const now = Date.now();
  if (tickerCache && now - tickerCache.at < TICKER_LIST_TTL_MS) return tickerCache.tickers;

  const since = new Date(now - MOVER_LOOKBACK_MS).toISOString();
  const { data, error } = await adminClient()
    .from("wire_news")
    .select("primary_ticker,tickers")
    .or(NEWS_SEC_SOURCE_OR)
    .gte("published_at", since)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(NEWS_ROW_LIMIT);
  if (error) throw error;

  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of data ?? []) {
    const primary = typeof row.primary_ticker === "string" ? row.primary_ticker.trim().toUpperCase() : "";
    const extra = Array.isArray(row.tickers) ? row.tickers : [];
    const candidates = [primary, ...extra.map((t) => String(t).trim().toUpperCase())];
    for (const ticker of candidates) {
      if (!ticker || seen.has(ticker)) continue;
      seen.add(ticker);
      out.push(ticker);
    }
  }
  tickerCache = { at: now, tickers: out };
  return out;
}

async function rankingBaseBySymbol(): Promise<Map<string, number>> {
  const now = Date.now();
  if (rankingBaseCache && now - rankingBaseCache.at < RANKING_TTL_MS) return rankingBaseCache.map;

  const map = new Map<string, number>();
  const [gainers, losers] = await Promise.all([
    tossSafe("rankings-gainers", () =>
      fetchTossRankings({ type: "TOP_GAINERS", marketCountry: "US", duration: "1d", count: 100 })
    ),
    tossSafe("rankings-losers", () =>
      fetchTossRankings({ type: "TOP_LOSERS", marketCountry: "US", duration: "1d", count: 100 })
    ),
  ]);
  for (const page of [gainers, losers]) {
    if (!page.ok) continue;
    for (const row of page.data.rankings ?? []) {
      const symbol = row.symbol?.trim().toUpperCase();
      const base = row.basePrice;
      if (!symbol || base == null || !(base > 0)) continue;
      if (looksLikeUnadjustedReverseSplit({ lastPrice: row.lastPrice, basePrice: base })) {
        prevClose.delete(symbol);
        continue;
      }
      map.set(symbol, base);
    }
  }
  rankingBaseCache = { at: now, map };
  return map;
}

function markUnknownToToss(
  ticker: string,
  result: { ok: true } | { ok: false; code?: string; status?: number }
): void {
  if (result.ok) return;
  if (result.status === 404 || result.code === "stock-not-found") unknownToToss.add(ticker);
}

async function fillPrevCloseFromCandles(tickers: string[]): Promise<number> {
  const need = tickers.filter((t) => !prevClose.has(t) && !unknownToToss.has(t));
  if (!need.length) return 0;
  let filled = 0;
  let scanned = 0;
  while (filled < CANDLES_PER_CYCLE && scanned < need.length) {
    const ticker = need[(candleCursor + scanned) % need.length];
    scanned += 1;
    const page = await tossSafe(`candles:${ticker}`, () =>
      fetchTossCandlesPage(ticker, "1d", { count: CANDLE_COUNT })
    );
    markUnknownToToss(ticker, page);
    if (page.ok) {
      const prev = priorSessionClose(page.data.candles);
      if (prev != null) {
        prevClose.set(ticker, prev);
        filled += 1;
      }
    }
  }
  candleCursor = need.length ? (candleCursor + scanned) % need.length : 0;
  return filled;
}

export type SyncTossQuotesResult = {
  tickers: number;
  upserted: number;
  withPct: number;
  fromPrices: number;
  fromRankings: number;
  fromCandles: number;
};

export async function syncTossQuotesForWireNews(): Promise<SyncTossQuotesResult> {
  const client = adminClient();
  const now = new Date();
  rollSession(now);

  const tickers = await loadRecentNewsTickers();
  const empty: SyncTossQuotesResult = {
    tickers: tickers.length,
    upserted: 0,
    withPct: 0,
    fromPrices: 0,
    fromRankings: 0,
    fromCandles: 0,
  };
  if (!tickers.length) return empty;

  const nowIso = now.toISOString();
  const byTicker = new Map<string, TickerQuote>();

  for (let i = 0; i < tickers.length; i += PRICE_CHUNK) {
    const chunk = tickers.slice(i, i + PRICE_CHUNK);
    const pricesRes = await tossSafe("prices", () => fetchTossPrices(chunk));
    if (!pricesRes.ok) continue;
    for (const p of pricesRes.data) {
      const ticker = p.symbol.trim().toUpperCase();
      if (!ticker) continue;
      const last = p.lastPrice != null && p.lastPrice > 0 ? p.lastPrice : null;
      if (p.changePct != null && last != null) {
        const native = dropSplitPct(ticker, roundPct(p.changePct), last);
        if (native != null) empty.fromPrices += 1;
      }
      byTicker.set(ticker, {
        ticker,
        lastPrice: last,
        changePct: applyPct(last, prevClose.get(ticker), ticker),
        currency: p.currency ?? "USD",
        fetchedAt: nowIso,
      });
    }
  }

  const missingPrev = tickers.filter((t) => byTicker.has(t) && !prevClose.has(t) && !unknownToToss.has(t));
  if (missingPrev.length) {
    const ranked = await rankingBaseBySymbol();
    for (const ticker of missingPrev) {
      const base = ranked.get(ticker);
      if (base == null) continue;
      prevClose.set(ticker, base);
      empty.fromRankings += 1;
    }
  }

  empty.fromCandles = await fillPrevCloseFromCandles(tickers.filter((t) => byTicker.has(t)));

  for (const q of byTicker.values()) {
    q.changePct = applyPct(q.lastPrice, prevClose.get(q.ticker), q.ticker);
  }

  const quotes = [...byTicker.values()];
  empty.upserted = await upsertTickerQuotes(client, quotes);
  empty.withPct = quotes.filter((q) => q.changePct != null).length;
  return empty;
}
