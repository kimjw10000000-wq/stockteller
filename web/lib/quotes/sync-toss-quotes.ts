import { createClient } from "@supabase/supabase-js";
import { fetchTossCandlesPage, fetchTossPrices } from "@/lib/toss/market-data";
import { fetchTossRankings } from "@/lib/toss/rankings";
import { tossSafe } from "@/lib/toss/client";
import { upsertTickerQuotes } from "./ticker-quotes";
import type { TickerQuote } from "./types";

const NEWS_TICKER_LIMIT = 160;
const CANDLE_FILL_LIMIT = 40;
const CANDLE_GAP_MS = 220;

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} 미설정`);
  return v;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function roundPct(n: number): number {
  return Math.round(n * 100) / 100;
}

function changePctFromCloses(prev: number, last: number): number | null {
  if (!Number.isFinite(prev) || !Number.isFinite(last) || prev === 0) return null;
  return roundPct(((last - prev) / prev) * 100);
}

async function loadRecentNewsTickers(): Promise<string[]> {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client
    .from("wire_news")
    .select("primary_ticker,tickers")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(NEWS_TICKER_LIMIT);
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
  return out;
}

async function rankingPctBySymbol(): Promise<Map<string, { lastPrice: number | null; changePct: number | null }>> {
  const map = new Map<string, { lastPrice: number | null; changePct: number | null }>();
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
      if (!symbol) continue;
      const pct = row.changeRate == null ? null : roundPct(row.changeRate * 100);
      map.set(symbol, { lastPrice: row.lastPrice, changePct: pct });
    }
  }
  return map;
}

const unknownToToss = new Set<string>();

function markUnknownToToss(
  ticker: string,
  result: { ok: true } | { ok: false; code?: string; status?: number }
): void {
  if (result.ok) return;
  if (result.status === 404 || result.code === "stock-not-found") unknownToToss.add(ticker);
}

async function fillFromCandles(
  tickers: string[],
  byTicker: Map<string, TickerQuote>,
  force: Set<string>
): Promise<number> {
  let filled = 0;
  for (const ticker of tickers) {
    if (filled >= CANDLE_FILL_LIMIT) break;
    if (unknownToToss.has(ticker) || !byTicker.has(ticker)) continue;
    const current = byTicker.get(ticker);
    if (current?.changePct != null && !force.has(ticker)) continue;
    const page = await tossSafe(`candles:${ticker}`, () =>
      fetchTossCandlesPage(ticker, "1d", { count: 2 })
    );
    markUnknownToToss(ticker, page);
    if (page.ok) {
      const closes = page.data.candles.map((c) => c.close).filter((n): n is number => n != null);
      if (closes.length >= 2) {
        const pct = changePctFromCloses(closes[closes.length - 2], closes[closes.length - 1]);
        const last = closes[closes.length - 1];
        byTicker.set(ticker, {
          ticker,
          lastPrice: current?.lastPrice ?? last ?? null,
          changePct: pct,
          currency: current?.currency ?? "USD",
          fetchedAt: new Date().toISOString(),
        });
        filled += 1;
      }
    }
    await sleep(CANDLE_GAP_MS);
  }
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
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

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

  const byTicker = new Map<string, TickerQuote>();
  const now = new Date().toISOString();

  const pricesRes = await tossSafe("prices", () => fetchTossPrices(tickers));
  if (pricesRes.ok) {
    for (const p of pricesRes.data) {
      const ticker = p.symbol.trim().toUpperCase();
      if (!ticker) continue;
      const pct = p.changePct == null ? null : roundPct(p.changePct);
      if (pct != null) empty.fromPrices += 1;
      byTicker.set(ticker, {
        ticker,
        lastPrice: p.lastPrice,
        changePct: pct,
        currency: p.currency ?? "USD",
        fetchedAt: now,
      });
    }
  }

  const missingPct = tickers.filter((t) => byTicker.get(t)?.changePct == null);
  if (missingPct.length) {
    const ranked = await rankingPctBySymbol();
    for (const ticker of missingPct) {
      const hit = ranked.get(ticker);
      if (!hit || hit.changePct == null) continue;
      const prev = byTicker.get(ticker);
      byTicker.set(ticker, {
        ticker,
        lastPrice: prev?.lastPrice ?? hit.lastPrice,
        changePct: hit.changePct,
        currency: prev?.currency ?? "USD",
        fetchedAt: now,
      });
      empty.fromRankings += 1;
    }
  }

  const stillMissing = tickers.filter(
    (t) => byTicker.has(t) && byTicker.get(t)?.changePct == null && !unknownToToss.has(t)
  );
  const refresh = tickers.filter((t) => byTicker.has(t) && !unknownToToss.has(t)).slice(0, 16);
  const candleQueue = [...new Set([...refresh, ...stillMissing])];
  empty.fromCandles = await fillFromCandles(candleQueue, byTicker, new Set(refresh));

  const quotes = [...byTicker.values()];
  empty.upserted = await upsertTickerQuotes(client, quotes);
  empty.withPct = quotes.filter((q) => q.changePct != null).length;
  return empty;
}
