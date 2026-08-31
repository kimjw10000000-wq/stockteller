import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fetchTossCandlesPage, fetchTossPrices } from "@/lib/toss/market-data";
import { fetchTossRankings } from "@/lib/toss/rankings";
import { tossSafe } from "@/lib/toss/client";
import { hideSplitDistortedPct, looksLikeUnadjustedReverseSplit } from "./split-adjusted";
import { upsertTickerQuotes } from "./ticker-quotes";
import { etDayKey } from "./poll-window";
import type { TickerQuote } from "./types";

const NEWS_TICKER_LIMIT = 160;
const CANDLES_PER_CYCLE = 3;
const TICKER_LIST_TTL_MS = 30_000;
const RANKING_TTL_MS = 60_000;

const prevClose = new Map<string, number>();
const unknownToToss = new Set<string>();
let sessionDay = "";
let tickerCache: { at: number; tickers: string[] } | null = null;
let rankingCache: {
  at: number;
  map: Map<string, { lastPrice: number | null; changePct: number | null; basePrice: number | null }>;
} | null = null;
let candleCursor = 0;
let hydrated = false;

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

function inferPrevClose(last: number, changePct: number): number | null {
  const denom = 1 + changePct / 100;
  if (!Number.isFinite(last) || !Number.isFinite(denom) || denom === 0) return null;
  const prev = last / denom;
  return Number.isFinite(prev) && prev > 0 ? prev : null;
}

function rememberPrevClose(ticker: string, last: number | null, changePct: number | null): void {
  if (prevClose.has(ticker) || last == null || changePct == null) return;
  if (looksLikeUnadjustedReverseSplit({ changePct, lastPrice: last })) return;
  const prev = inferPrevClose(last, changePct);
  if (prev != null) prevClose.set(ticker, prev);
}

function rollSession(now: Date, lastPrices: Map<string, number>): void {
  const day = etDayKey(now);
  if (sessionDay && day !== sessionDay) {
    for (const [ticker, last] of lastPrices) {
      if (last > 0) prevClose.set(ticker, last);
    }
  }
  sessionDay = day;
}

async function loadRecentNewsTickers(): Promise<string[]> {
  const now = Date.now();
  if (tickerCache && now - tickerCache.at < TICKER_LIST_TTL_MS) return tickerCache.tickers;

  const { data, error } = await adminClient()
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
  tickerCache = { at: now, tickers: out };
  return out;
}

async function hydratePrevCloseFromDb(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  const { data, error } = await adminClient()
    .from("ticker_quotes")
    .select("ticker,last_price,change_pct");
  if (error) {
    console.error("[quotes] hydrate", error.message);
    return;
  }
  for (const row of data ?? []) {
    const ticker = typeof row.ticker === "string" ? row.ticker.trim().toUpperCase() : "";
    if (!ticker) continue;
    const last = row.last_price == null ? null : Number(row.last_price);
    const pct = row.change_pct == null ? null : Number(row.change_pct);
    if (last != null && Number.isFinite(last) && last > 0) {
      rememberPrevClose(ticker, last, pct);
    }
  }
}

async function rankingPctBySymbol(): Promise<
  Map<string, { lastPrice: number | null; changePct: number | null; basePrice: number | null }>
> {
  const now = Date.now();
  if (rankingCache && now - rankingCache.at < RANKING_TTL_MS) return rankingCache.map;

  const map = new Map<string, { lastPrice: number | null; changePct: number | null; basePrice: number | null }>();
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
      const rawPct = row.changeRate == null ? null : roundPct(row.changeRate * 100);
      const pct = hideSplitDistortedPct(rawPct, row.lastPrice, row.basePrice);
      if (
        pct == null &&
        looksLikeUnadjustedReverseSplit({
          changePct: rawPct,
          lastPrice: row.lastPrice,
          basePrice: row.basePrice,
        })
      ) {
        prevClose.delete(symbol);
      }
      map.set(symbol, { lastPrice: row.lastPrice, changePct: pct, basePrice: row.basePrice });
    }
  }
  rankingCache = { at: now, map };
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
      fetchTossCandlesPage(ticker, "1d", { count: 2 })
    );
    markUnknownToToss(ticker, page);
    if (page.ok) {
      const closes = page.data.candles.map((c) => c.close).filter((n): n is number => n != null);
      if (closes.length >= 2) {
        const prev = closes[closes.length - 2];
        if (prev > 0) {
          prevClose.set(ticker, prev);
          filled += 1;
        }
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
  await hydratePrevCloseFromDb();

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

  const now = new Date();
  const nowIso = now.toISOString();
  const byTicker = new Map<string, TickerQuote>();
  const lastPrices = new Map<string, number>();

  const pricesRes = await tossSafe("prices", () => fetchTossPrices(tickers));
  if (pricesRes.ok) {
    for (const p of pricesRes.data) {
      const ticker = p.symbol.trim().toUpperCase();
      if (!ticker) continue;
      if (p.lastPrice != null && p.lastPrice > 0) lastPrices.set(ticker, p.lastPrice);
      rememberPrevClose(ticker, p.lastPrice, p.changePct == null ? null : roundPct(p.changePct));
      const prev = prevClose.get(ticker);
      const rawPct =
        p.changePct != null
          ? roundPct(p.changePct)
          : prev != null && p.lastPrice != null
            ? roundPct(((p.lastPrice - prev) / prev) * 100)
            : null;
      const pct = dropSplitPct(ticker, rawPct, p.lastPrice);
      if (p.changePct != null && pct != null) empty.fromPrices += 1;
      byTicker.set(ticker, {
        ticker,
        lastPrice: p.lastPrice,
        changePct: pct,
        currency: p.currency ?? "USD",
        fetchedAt: nowIso,
      });
    }
  }

  rollSession(now, lastPrices);

  const missingPct = tickers.filter((t) => byTicker.get(t)?.changePct == null);
  if (missingPct.length) {
    const ranked = await rankingPctBySymbol();
    for (const ticker of missingPct) {
      const hit = ranked.get(ticker);
      if (!hit) continue;
      const prev = byTicker.get(ticker);
      const last = prev?.lastPrice ?? hit.lastPrice;
      rememberPrevClose(ticker, last, hit.changePct);
      const pc = prevClose.get(ticker);
      const rawPct =
        pc != null && last != null
          ? roundPct(((last - pc) / pc) * 100)
          : hit.changePct;
      const pct = dropSplitPct(ticker, rawPct, last, hit.basePrice);
      if (pct == null) continue;
      byTicker.set(ticker, {
        ticker,
        lastPrice: last,
        changePct: pct,
        currency: prev?.currency ?? "USD",
        fetchedAt: nowIso,
      });
      empty.fromRankings += 1;
    }
  }

  empty.fromCandles = await fillPrevCloseFromCandles(
    tickers.filter((t) => byTicker.has(t))
  );
  for (const ticker of tickers) {
    const q = byTicker.get(ticker);
    const pc = prevClose.get(ticker);
    if (!q || q.changePct != null || q.lastPrice == null || pc == null || pc === 0) continue;
    q.changePct = dropSplitPct(ticker, roundPct(((q.lastPrice - pc) / pc) * 100), q.lastPrice);
  }

  for (const q of byTicker.values()) {
    q.changePct = dropSplitPct(q.ticker, q.changePct, q.lastPrice);
  }

  const quotes = [...byTicker.values()];
  empty.upserted = await upsertTickerQuotes(client, quotes);
  empty.withPct = quotes.filter((q) => q.changePct != null).length;
  return empty;
}
