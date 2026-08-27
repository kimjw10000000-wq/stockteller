import type {
  TossCandleInterval,
  TossCandleNormalized,
  TossCandlePage,
  TossExchangeRate,
  TossKoreanMarketDetail,
  TossKrMarketDay,
  TossMarketCalendar,
  TossOrderbook,
  TossOrderbookEntry,
  TossPriceLimits,
  TossPriceNormalized,
  TossPriceRaw,
  TossRankingRow,
  TossRankingsPage,
  TossStockInfo,
  TossStockWarning,
  TossTrade,
  TossUsMarketDay,
  TossUsSession,
  TossWarningType,
} from "./types";

export function unwrapResult<T>(data: unknown): T {
  if (data && typeof data === "object" && "result" in data) {
    return (data as { result: T }).result;
  }
  return data as T;
}

export function asArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    for (const key of ["result", "prices", "data", "items", "rankings", "trades", "candles"]) {
      const v = o[key];
      if (Array.isArray(v)) return v;
      if (v && typeof v === "object") {
        const inner = v as Record<string, unknown>;
        for (const k2 of ["result", "prices", "items", "list", "rankings", "trades", "candles"]) {
          if (Array.isArray(inner[k2])) return inner[k2] as unknown[];
        }
      }
    }
  }
  return [];
}

export function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export function str(v: unknown): string | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t ? t : null;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

export function bool(v: unknown): boolean {
  return v === true || v === "true" || v === 1 || v === "1";
}

function session(v: unknown): TossUsSession | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  return {
    startTime: str(o.startTime),
    endTime: str(o.endTime),
  };
}

function krSession(v: unknown): {
  startTime: string | null;
  singlePriceAuctionStartTime: string | null;
  singlePriceAuctionEndTime: string | null;
  endTime: string | null;
} | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  return {
    startTime: str(o.startTime),
    singlePriceAuctionStartTime: str(o.singlePriceAuctionStartTime),
    singlePriceAuctionEndTime: str(o.singlePriceAuctionEndTime),
    endTime: str(o.endTime),
  };
}

export function parsePrice(row: unknown): TossPriceNormalized | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const nested =
    r.price && typeof r.price === "object" && !Array.isArray(r.price)
      ? (r.price as Record<string, unknown>)
      : {};
  const symbol = str(r.symbol) ?? str(r.stockCode) ?? str(r.code) ?? str(nested.symbol);
  if (!symbol) return null;
  const lastPrice =
    num(r.lastPrice) ??
    num(nested.lastPrice) ??
    (typeof r.price === "number" ? r.price : num(r.close)) ??
    num(r.last) ??
    num(r.tradePrice) ??
    num(nested.close);
  const changePct =
    num(r.changeRate) ??
    num(nested.changeRate) ??
    num(r.changePct) ??
    num(nested.changePct) ??
    num(r.changePercent) ??
    num(nested.changePercent) ??
    num(r.fluctuationRate) ??
    num(nested.fluctuationRate);
  return {
    symbol,
    timestamp: str(r.timestamp) ?? str(nested.timestamp),
    lastPrice,
    currency: str(r.currency) ?? str(r.currencyCode) ?? str(nested.currency),
    price: lastPrice,
    change:
      num(r.change) ??
      num(r.changePrice) ??
      num(r.diff) ??
      num(nested.change) ??
      num(nested.changePrice),
    changePct,
    volume:
      num(r.volume) ??
      num(r.accVolume) ??
      num(r.tradeVolume) ??
      num(nested.volume) ??
      num(nested.accVolume),
    raw: row,
  };
}

function orderbookEntry(row: unknown): TossOrderbookEntry | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const priceRaw = str(r.price) ?? "";
  const volumeRaw = str(r.volume) ?? "";
  return {
    price: num(r.price),
    volume: num(r.volume),
    priceRaw,
    volumeRaw,
  };
}

export function parseOrderbook(symbol: string, data: unknown): TossOrderbook {
  const result = unwrapResult<Record<string, unknown>>(data);
  const asksRaw = Array.isArray(result?.asks)
    ? result.asks
    : Array.isArray(result?.ask)
      ? result.ask
      : [];
  const bidsRaw = Array.isArray(result?.bids)
    ? result.bids
    : Array.isArray(result?.bid)
      ? result.bid
      : [];
  return {
    symbol,
    timestamp: str(result?.timestamp),
    currency: str(result?.currency),
    asks: asksRaw.map(orderbookEntry).filter((x): x is TossOrderbookEntry => x != null),
    bids: bidsRaw.map(orderbookEntry).filter((x): x is TossOrderbookEntry => x != null),
    raw: data,
  };
}

export function parseTrade(symbol: string, row: unknown): TossTrade | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  return {
    symbol: str(r.symbol) ?? symbol,
    price: num(r.price),
    volume: num(r.volume) ?? num(r.quantity),
    timestamp: str(r.timestamp),
    currency: str(r.currency),
    raw: row,
  };
}

export function parseCandle(row: unknown): TossCandleNormalized | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const open = num(r.open) ?? num(r.openPrice) ?? num(r.o);
  const high = num(r.high) ?? num(r.highPrice) ?? num(r.h);
  const low = num(r.low) ?? num(r.lowPrice) ?? num(r.l);
  const close = num(r.close) ?? num(r.closePrice) ?? num(r.c);
  if (open == null || high == null || low == null || close == null) return null;
  const timestamp =
    str(r.timestamp) ?? str(r.datetime) ?? str(r.dateTime) ?? str(r.time) ?? str(r.date) ?? "";
  if (!timestamp) return null;
  return {
    timestamp,
    open,
    high,
    low,
    close,
    volume: num(r.volume) ?? num(r.v),
    currency: str(r.currency),
  };
}

export function parseCandlePage(
  symbol: string,
  interval: TossCandleInterval,
  data: unknown
): TossCandlePage {
  const result = unwrapResult<Record<string, unknown>>(data);
  let rows: unknown[] = [];
  if (Array.isArray(data)) rows = data;
  else if (Array.isArray(result)) rows = result as unknown[];
  else if (result && typeof result === "object") {
    if (Array.isArray(result.candles)) rows = result.candles;
  }
  const candles = rows
    .map(parseCandle)
    .filter((x): x is TossCandleNormalized => x != null)
    .slice()
    .reverse();
  return {
    symbol,
    interval,
    candles,
    nextBefore: str((result as Record<string, unknown> | null)?.nextBefore),
    raw: data,
  };
}

export function parsePriceLimits(symbol: string, data: unknown): TossPriceLimits {
  const result = unwrapResult<Record<string, unknown>>(data);
  return {
    symbol,
    timestamp: str(result?.timestamp),
    upperLimitPrice: num(result?.upperLimitPrice) ?? num(result?.upper),
    lowerLimitPrice: num(result?.lowerLimitPrice) ?? num(result?.lower),
    currency: str(result?.currency),
    raw: data,
  };
}

function parseKoreanDetail(v: unknown): TossKoreanMarketDetail | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  return {
    liquidationTrading: bool(o.liquidationTrading),
    nxtSupported: bool(o.nxtSupported),
    krxTradingSuspended: bool(o.krxTradingSuspended),
    nxtTradingSuspended: bool(o.nxtTradingSuspended),
  };
}

export function parseStockInfo(row: unknown): TossStockInfo | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const symbol = str(r.symbol);
  if (!symbol) return null;
  return {
    symbol,
    name: str(r.name) ?? "",
    englishName: str(r.englishName) ?? "",
    isinCode: str(r.isinCode) ?? "",
    market: str(r.market) ?? "",
    securityType: str(r.securityType) ?? "",
    isCommonShare: bool(r.isCommonShare),
    status: str(r.status) ?? "ACTIVE",
    currency: str(r.currency) ?? "",
    listDate: str(r.listDate),
    delistDate: str(r.delistDate),
    sharesOutstanding: str(r.sharesOutstanding) ?? "",
    leverageFactor: str(r.leverageFactor),
    koreanMarketDetail: parseKoreanDetail(r.koreanMarketDetail),
    raw: row,
  };
}

export function parseStockWarning(symbol: string, row: unknown): TossStockWarning | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const warningType = (str(r.warningType) ?? "UNKNOWN") as TossWarningType;
  const endDate = str(r.endDate);
  const startDate = str(r.startDate);
  const today = new Date().toISOString().slice(0, 10);
  let active = true;
  if (startDate && startDate.slice(0, 10) > today) active = false;
  if (endDate && endDate.slice(0, 10) < today) active = false;
  return {
    symbol,
    warningType,
    exchange: str(r.exchange),
    startDate,
    endDate,
    active,
    raw: row,
  };
}

export function parseExchangeRate(data: unknown): TossExchangeRate {
  const result = unwrapResult<Record<string, unknown>>(data);
  return {
    baseCurrency: str(result?.baseCurrency) ?? "USD",
    quoteCurrency: str(result?.quoteCurrency) ?? "KRW",
    rate: num(result?.rate) ?? num(result?.basePrice),
    midRate: num(result?.midRate),
    basisPoint: str(result?.basisPoint),
    rateChangeType: str(result?.rateChangeType),
    validFrom: str(result?.validFrom),
    validUntil: str(result?.validUntil),
    raw: data,
  };
}

function parseUsDay(v: unknown): TossUsMarketDay | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  return {
    date: str(o.date) ?? "",
    dayMarket: session(o.dayMarket),
    preMarket: session(o.preMarket),
    regularMarket: session(o.regularMarket),
    afterMarket: session(o.afterMarket),
  };
}

function parseKrDay(v: unknown): TossKrMarketDay | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const integrated =
    o.integrated && typeof o.integrated === "object"
      ? (() => {
          const i = o.integrated as Record<string, unknown>;
          return {
            preMarket: krSession(i.preMarket),
            regularMarket: krSession(i.regularMarket),
            afterMarket: krSession(i.afterMarket),
          };
        })()
      : null;
  return {
    date: str(o.date) ?? "",
    integrated,
  };
}

export function parseMarketCalendar(country: "US" | "KR", data: unknown): TossMarketCalendar {
  const result = unwrapResult<Record<string, unknown>>(data);
  if (country === "US") {
    return {
      country: "US",
      today: parseUsDay(result?.today) ?? {
        date: "",
        dayMarket: null,
        preMarket: null,
        regularMarket: null,
        afterMarket: null,
      },
      previousBusinessDay: parseUsDay(result?.previousBusinessDay),
      nextBusinessDay: parseUsDay(result?.nextBusinessDay),
      raw: data,
    };
  }
  return {
    country: "KR",
    today: parseKrDay(result?.today) ?? { date: "", integrated: null },
    previousBusinessDay: parseKrDay(result?.previousBusinessDay),
    nextBusinessDay: parseKrDay(result?.nextBusinessDay),
    raw: data,
  };
}

export function parseRankingRow(row: unknown): TossRankingRow | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const symbol = str(r.symbol);
  if (!symbol) return null;
  const price = r.price && typeof r.price === "object" ? (r.price as Record<string, unknown>) : {};
  return {
    rank: num(r.rank) ?? 0,
    symbol,
    currency: str(r.currency) ?? "",
    lastPrice: num(price.lastPrice) ?? num(r.lastPrice),
    basePrice: num(price.basePrice) ?? num(r.basePrice),
    changeRate: num(price.changeRate) ?? num(r.changeRate),
    tradingVolume: num(r.tradingVolume),
    tradingAmount: num(r.tradingAmount),
    raw: row,
  };
}

export function parseRankingsPage(
  meta: { marketCountry: "KR" | "US"; type: string; duration: string },
  data: unknown
): TossRankingsPage {
  const result = unwrapResult<Record<string, unknown>>(data);
  const list = Array.isArray(result?.rankings)
    ? result.rankings
    : Array.isArray(result)
      ? (result as unknown[])
      : [];
  return {
    marketCountry: meta.marketCountry,
    type: meta.type,
    duration: meta.duration,
    rankedAt: str(result?.rankedAt),
    rankings: list.map(parseRankingRow).filter((x): x is TossRankingRow => x != null),
    raw: data,
  };
}

/** Re-export raw price type for docs */
export type { TossPriceRaw };
