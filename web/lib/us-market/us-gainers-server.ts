import { fetchAlphaVantageTopGainersAll } from "./alpha-vantage-gainers";
import { refineGainersWithFinnhubQuotes } from "./finnhub-us-quote";
import type { UsDayGainerQuote } from "./us-day-gainer-types";
import { buildAllYahooDayGainersUrls, parseYahooDayGainersJson } from "./yahoo-screener-parse";

const YAHOO_SCRAPER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const YAHOO_BROWSER_LIKE_HEADERS: HeadersInit = {
  "User-Agent": YAHOO_SCRAPER_UA,
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://finance.yahoo.com/",
  Origin: "https://finance.yahoo.com",
};

const YAHOO_FETCH_MS = 8_000;

/** Yahoo day_gainers = 당일(또는 직전 정규장) 스크리너. AV TOP_GAINERS = 전일 마감 스냅샷에 가깝다. */
export type UsGainersDataSource = "yahoo" | "alphavantage" | "empty";

export type UsGainersRouteExtras = {
  delayedMarketSnapshot: boolean;
  finnhubQuoteRefined: boolean;
};

/** Day gainers 스크리너에서 등락률만 파싱(minPct=0). */
async function fetchYahooDayGainerQuotesParsed(): Promise<UsDayGainerQuote[]> {
  for (const url of buildAllYahooDayGainersUrls()) {
    try {
      const res = await fetch(url, {
        headers: YAHOO_BROWSER_LIKE_HEADERS,
        cache: "no-store",
        signal: AbortSignal.timeout(YAHOO_FETCH_MS),
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (!text || text.startsWith("<")) continue;
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        continue;
      }
      const items = parseYahooDayGainersJson(json, 0);
      if (items.length > 0) return items;
    } catch {
      /* timeout, reset */
    }
  }
  return [];
}

function filterMinPctSorted(items: UsDayGainerQuote[], minPct: number): UsDayGainerQuote[] {
  return items
    .filter((x) => x.regularMarketChangePercent >= minPct)
    .sort((a, b) => b.regularMarketChangePercent - a.regularMarketChangePercent);
}

/**
 * Yahoo 스크리너로 후보를 잡고, FINNHUB_API_KEY가 있으면 Finnhub /quote(dp)로 등락·가격을 맞춘다(실시간 틱 아님·플랜별 지연).
 * Yahoo에 +minPct 가 없을 때만 AV로 채우는데, 그때는 전일 스냅샷(delayedMarketSnapshot)으로 표시한다.
 */
export async function getUsMarketGainersForRoute(minPct: number): Promise<{
  items: UsDayGainerQuote[];
  source: UsGainersDataSource;
} & UsGainersRouteExtras> {
  const [yahooAll, avAll] = await Promise.all([
    fetchYahooDayGainerQuotesParsed(),
    fetchAlphaVantageTopGainersAll(),
  ]);

  if (yahooAll.length > 0) {
    const fromYahoo = filterMinPctSorted(yahooAll, minPct);
    if (fromYahoo.length > 0) {
      const { items, refined } = await refineGainersWithFinnhubQuotes(fromYahoo, minPct, 20);
      return {
        items,
        source: "yahoo",
        delayedMarketSnapshot: false,
        finnhubQuoteRefined: refined,
      };
    }
    const fromAv = filterMinPctSorted(avAll, minPct);
    if (fromAv.length > 0) {
      return {
        items: fromAv,
        source: "alphavantage",
        delayedMarketSnapshot: true,
        finnhubQuoteRefined: false,
      };
    }
    return {
      items: [],
      source: "yahoo",
      delayedMarketSnapshot: false,
      finnhubQuoteRefined: false,
    };
  }

  const items = filterMinPctSorted(avAll, minPct);
  if (items.length === 0) {
    return {
      items: [],
      source: "empty",
      delayedMarketSnapshot: false,
      finnhubQuoteRefined: false,
    };
  }
  return {
    items,
    source: "alphavantage",
    delayedMarketSnapshot: true,
    finnhubQuoteRefined: false,
  };
}
