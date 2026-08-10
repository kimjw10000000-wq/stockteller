/**
 * US-market focused Toss aggregators.
 *
 * Note: Toss Open API does NOT expose:
 * - a full US ticker master dump (use /stocks with symbols, or rankings candidates)
 * - a bulk US trade-halt feed (use NASDAQ RSS + per-symbol /warnings)
 */

import { tossSafe } from "./client";
import {
  fetchTossCandlesPage,
  fetchTossOrderbook,
  fetchTossPriceLimits,
  fetchTossPrices,
  fetchTossTrades,
} from "./market-data";
import { fetchTossExchangeRate } from "./market-info";
import { fetchUsRankingsBundle } from "./rankings";
import {
  fetchTossMarketCalendar,
  fetchTossStockMap,
  fetchTossWarningsForSymbols,
} from "./stocks";
import type {
  TossUsMarketBundle,
  TossUsMarketCalendar,
  TossUsSymbolSnapshot,
} from "./types";

function uniqSymbols(symbols: string[], limit = 50): string[] {
  return Array.from(new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))).slice(
    0,
    limit
  );
}

/** Ranking-based US symbol candidates (not a full exchange master). */
export async function fetchUsSymbolUniverseCandidates(limit = 100): Promise<{
  symbols: string[];
  notes: string[];
  errors: string[];
}> {
  const notes = [
    "Toss에 미국 전 종목 마스터 API는 없습니다. 랭킹(급등/급락/거래량) 후보 + 호출측 심볼 목록을 사용합니다.",
    "전체 티커 마스터는 us_listed_companies(SEC sync)와 병행하세요.",
  ];
  const bundle = await fetchUsRankingsBundle(Math.min(limit, 100));
  const symbols: string[] = [];
  for (const page of [bundle.topGainers, bundle.topLosers, bundle.volume]) {
    for (const row of page?.rankings ?? []) {
      const s = row.symbol.trim().toUpperCase();
      if (s && !symbols.includes(s)) symbols.push(s);
    }
  }
  return { symbols: symbols.slice(0, limit), notes, errors: bundle.errors };
}

/** Per-symbol US snapshot: stock + price + book + trades + limits + warnings */
export async function fetchUsSymbolSnapshot(
  symbol: string,
  options?: { includeOrderbook?: boolean; includeTrades?: boolean; tradeCount?: number }
): Promise<TossUsSymbolSnapshot> {
  const s = symbol.trim().toUpperCase();
  const errors: Record<string, string> = {};
  const includeOrderbook = options?.includeOrderbook !== false;
  const includeTrades = options?.includeTrades !== false;

  const [stockMap, prices, orderbook, trades, limits, warnings] = await Promise.all([
    tossSafe("stock", () => fetchTossStockMap([s])),
    tossSafe("price", () => fetchTossPrices([s])),
    includeOrderbook
      ? tossSafe("orderbook", () => fetchTossOrderbook(s))
      : Promise.resolve({ ok: true as const, data: null }),
    includeTrades
      ? tossSafe("trades", () => fetchTossTrades(s, options?.tradeCount ?? 20))
      : Promise.resolve({ ok: true as const, data: [] as Awaited<ReturnType<typeof fetchTossTrades>> }),
    tossSafe("price-limits", () => fetchTossPriceLimits(s)),
    tossSafe("warnings", () =>
      fetchTossWarningsForSymbols([s]).then((m) => m.get(s) ?? [])
    ),
  ]);

  if (!stockMap.ok) errors.stock = stockMap.error;
  if (!prices.ok) errors.price = prices.error;
  if (!orderbook.ok) errors.orderbook = orderbook.error;
  if (!trades.ok) errors.trades = trades.error;
  if (!limits.ok) errors.priceLimits = limits.error;
  if (!warnings.ok) errors.warnings = warnings.error;

  return {
    symbol: s,
    stock: stockMap.ok ? stockMap.data.get(s) ?? null : null,
    price: prices.ok ? prices.data[0] ?? null : null,
    orderbook: orderbook.ok ? orderbook.data : null,
    trades: trades.ok ? trades.data : [],
    priceLimits: limits.ok ? limits.data : null,
    warnings: warnings.ok ? warnings.data : [],
    errors,
  };
}

/** Multi-symbol US market bundle (calendar + FX + rankings + snapshots) */
export async function fetchUsMarketBundle(
  symbols: string[],
  options?: {
    maxSymbols?: number;
    includeOrderbook?: boolean;
    includeTrades?: boolean;
  }
): Promise<TossUsMarketBundle> {
  const notes: string[] = [
    "미국 Halt/Resume 전체 피드는 Toss에 없음 → NASDAQ RSS(/api/halts)와 병합 사용.",
    "VI/유의는 종목별 /stocks/{symbol}/warnings.",
  ];
  const list = uniqSymbols(symbols, options?.maxSymbols ?? 20);

  const [calendarRes, fxRes, rankings, stockMap] = await Promise.all([
    tossSafe("us-calendar", () => fetchTossMarketCalendar("US")),
    tossSafe("fx", () => fetchTossExchangeRate({ baseCurrency: "USD", quoteCurrency: "KRW" })),
    fetchUsRankingsBundle(50),
    tossSafe("stocks", () => fetchTossStockMap(list)),
  ]);

  if (!calendarRes.ok) notes.push(`calendar: ${calendarRes.error}`);
  if (!fxRes.ok) notes.push(`fx: ${fxRes.error}`);
  notes.push(...rankings.errors.map((e) => `rankings: ${e}`));

  const pricesRes = await tossSafe("prices", () => fetchTossPrices(list));
  const warningsMap = await fetchTossWarningsForSymbols(list, { concurrency: 4 });

  const snapshots: TossUsSymbolSnapshot[] = [];
  for (const sym of list) {
    const snap: TossUsSymbolSnapshot = {
      symbol: sym,
      stock: stockMap.ok ? stockMap.data.get(sym) ?? null : null,
      price: pricesRes.ok ? pricesRes.data.find((p) => p.symbol.toUpperCase() === sym) ?? null : null,
      orderbook: null,
      trades: [],
      priceLimits: null,
      warnings: warningsMap.get(sym) ?? [],
      errors: {},
    };
    if (!stockMap.ok) snap.errors.stock = stockMap.error;
    if (!pricesRes.ok) snap.errors.price = pricesRes.error;

    if (options?.includeOrderbook) {
      const ob = await tossSafe(`ob:${sym}`, () => fetchTossOrderbook(sym));
      if (ob.ok) snap.orderbook = ob.data;
      else snap.errors.orderbook = ob.error;
    }
    if (options?.includeTrades) {
      const tr = await tossSafe(`tr:${sym}`, () => fetchTossTrades(sym, 10));
      if (tr.ok) snap.trades = tr.data;
      else snap.errors.trades = tr.error;
    }
    const lim = await tossSafe(`lim:${sym}`, () => fetchTossPriceLimits(sym));
    if (lim.ok) snap.priceLimits = lim.data;
    else snap.errors.priceLimits = lim.error;

    snapshots.push(snap);
  }

  return {
    fetchedAt: new Date().toISOString(),
    calendar: calendarRes.ok ? (calendarRes.data as TossUsMarketCalendar) : null,
    exchangeRateUsdKrw: fxRes.ok ? fxRes.data : null,
    rankings: {
      topGainers: rankings.topGainers,
      topLosers: rankings.topLosers,
      volume: rankings.volume,
    },
    snapshots,
    notes,
  };
}

/** US extended-hours oriented candle helper (1m / 1d) */
export async function fetchUsCandles(
  symbol: string,
  interval: "1m" | "1d" = "1d",
  count = 60
) {
  return fetchTossCandlesPage(symbol, interval, { count, adjusted: true });
}
