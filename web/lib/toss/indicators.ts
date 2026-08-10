import { requireTossConfigured, tossFetch } from "./client";
import { asArray, parseCandlePage, parsePrice, unwrapResult } from "./parse";
import type {
  TossCandleInterval,
  TossIndicatorCandlePage,
  TossIndicatorPrice,
  TossMarketIndicatorSymbol,
} from "./types";
import { TOSS_MARKET_INDICATOR_SYMBOLS } from "./types";

export { TOSS_MARKET_INDICATOR_SYMBOLS };

/** GET /api/v1/market-indicators/prices */
export async function fetchTossIndicatorPrices(
  symbols: Array<TossMarketIndicatorSymbol | string>
): Promise<TossIndicatorPrice[]> {
  requireTossConfigured();
  const list = symbols.map((s) => s.trim()).filter(Boolean).slice(0, 200);
  if (!list.length) return [];
  const data = await tossFetch<unknown>("/api/v1/market-indicators/prices", {
    searchParams: { symbols: list.join(",") },
  });
  return asArray(data)
    .map((row) => {
      const p = parsePrice(row);
      if (!p) return null;
      return {
        symbol: p.symbol,
        timestamp: p.timestamp,
        lastPrice: p.lastPrice,
        currency: p.currency,
        raw: row,
      } satisfies TossIndicatorPrice;
    })
    .filter((x): x is TossIndicatorPrice => x != null);
}

/** GET /api/v1/market-indicators/{symbol}/candles */
export async function fetchTossIndicatorCandles(
  symbol: string,
  interval: TossCandleInterval = "1d",
  options?: { count?: number; before?: string }
): Promise<TossIndicatorCandlePage> {
  requireTossConfigured();
  const s = symbol.trim();
  if (!s) throw new Error("symbol 필요");
  const data = await tossFetch<unknown>(
    `/api/v1/market-indicators/${encodeURIComponent(s)}/candles`,
    {
      searchParams: {
        interval,
        count: String(Math.min(Math.max(options?.count ?? 60, 1), 200)),
        before: options?.before,
      },
    }
  );
  const page = parseCandlePage(s, interval, data);
  return {
    symbol: s,
    interval,
    candles: page.candles,
    nextBefore: page.nextBefore,
    raw: data,
  };
}

/** Optional: investor trading for KOSPI/KOSDAQ */
export async function fetchTossInvestorTrading(
  symbol: "KOSPI" | "KOSDAQ",
  options?: { interval?: string; until?: string; count?: number }
): Promise<unknown> {
  requireTossConfigured();
  const data = await tossFetch<unknown>(
    `/api/v1/market-indicators/${symbol}/investor-trading`,
    {
      searchParams: {
        interval: options?.interval,
        until: options?.until,
        count: options?.count != null ? String(options.count) : undefined,
      },
    }
  );
  return unwrapResult(data);
}

export type { TossCandleNormalized, TossCandlePage } from "./types";
