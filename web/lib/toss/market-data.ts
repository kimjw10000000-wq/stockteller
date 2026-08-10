import { requireTossConfigured, tossFetch } from "./client";
import {
  asArray,
  parseCandlePage,
  parseOrderbook,
  parsePrice,
  parsePriceLimits,
  parseTrade,
} from "./parse";
import type {
  TossCandleInterval,
  TossCandlePage,
  TossOrderbook,
  TossPriceLimits,
  TossPriceNormalized,
  TossTrade,
} from "./types";

/** GET /api/v1/prices — max 200 symbols */
export async function fetchTossPrices(symbols: string[]): Promise<TossPriceNormalized[]> {
  requireTossConfigured();
  const list = symbols.map((s) => s.trim()).filter(Boolean).slice(0, 200);
  if (!list.length) return [];
  const data = await tossFetch<unknown>("/api/v1/prices", {
    searchParams: { symbols: list.join(",") },
  });
  return asArray(data)
    .map(parsePrice)
    .filter((x): x is TossPriceNormalized => x != null);
}

/** GET /api/v1/orderbook */
export async function fetchTossOrderbook(symbol: string): Promise<TossOrderbook> {
  requireTossConfigured();
  const s = symbol.trim();
  if (!s) throw new Error("symbol 필요");
  const data = await tossFetch<unknown>("/api/v1/orderbook", {
    searchParams: { symbol: s },
  });
  return parseOrderbook(s, data);
}

/** GET /api/v1/trades — max count 50 */
export async function fetchTossTrades(symbol: string, count = 20): Promise<TossTrade[]> {
  requireTossConfigured();
  const s = symbol.trim();
  if (!s) return [];
  const data = await tossFetch<unknown>("/api/v1/trades", {
    searchParams: {
      symbol: s,
      count: String(Math.min(Math.max(count, 1), 50)),
    },
  });
  return asArray(data)
    .map((row) => parseTrade(s, row))
    .filter((x): x is TossTrade => x != null);
}

/** GET /api/v1/candles */
export async function fetchTossCandlesPage(
  symbol: string,
  interval: TossCandleInterval = "1d",
  options?: { count?: number; before?: string; adjusted?: boolean }
): Promise<TossCandlePage> {
  requireTossConfigured();
  const s = symbol.trim();
  if (!s) throw new Error("symbol 필요");
  const data = await tossFetch<unknown>("/api/v1/candles", {
    searchParams: {
      symbol: s,
      interval,
      count: String(Math.min(Math.max(options?.count ?? 60, 1), 200)),
      before: options?.before,
      adjusted:
        options?.adjusted == null ? undefined : options.adjusted ? "true" : "false",
    },
  });
  return parseCandlePage(s, interval, data);
}

/** Convenience: candles array only (legacy) */
export async function fetchTossCandles(
  symbol: string,
  interval: TossCandleInterval = "1d",
  count = 60
): Promise<TossCandlePage["candles"]> {
  const page = await fetchTossCandlesPage(symbol, interval, { count });
  return page.candles;
}

/** GET /api/v1/price-limits */
export async function fetchTossPriceLimits(symbol: string): Promise<TossPriceLimits> {
  requireTossConfigured();
  const s = symbol.trim();
  if (!s) throw new Error("symbol 필요");
  const data = await tossFetch<unknown>("/api/v1/price-limits", {
    searchParams: { symbol: s },
  });
  return parsePriceLimits(s, data);
}

/** @deprecated alias */
export type TossPrice = TossPriceNormalized;
export type TossCandle = TossCandlePage["candles"][number];
export { parsePrice as normalizeTossPrice };
