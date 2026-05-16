import type { UsDayGainerQuote } from "./us-day-gainer-types";

function yahooDayGainersSearchString(): string {
  const url = new URL("https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved");
  url.searchParams.set("scrIds", "day_gainers");
  url.searchParams.set("count", "1000");
  url.searchParams.set("formatted", "false");
  url.searchParams.set("lang", "en-US");
  url.searchParams.set("region", "US");
  return `${url.pathname}?${url.searchParams.toString()}`;
}

/** 브라우저/서버 공통 — 스크리너 URL (query1). */
export function buildYahooDayGainersUrl(): string {
  return `https://query1.finance.yahoo.com${yahooDayGainersSearchString()}`;
}

/** 서버에서 차단 회피를 위해 query1·query2 둘 다 시도할 때 사용. */
export function buildAllYahooDayGainersUrls(): string[] {
  const q = yahooDayGainersSearchString();
  return [`https://query1.finance.yahoo.com${q}`, `https://query2.finance.yahoo.com${q}`];
}

/** Yahoo가 숫자·문자열 등으로 혼합해 보내는 경우 대비 */
export function coerceYahooNumber(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = parseFloat(raw.replace(/%/g, "").replace(/,/g, "").replace(/\+/g, "").trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Yahoo 스크리너 JSON → 등락률 등 파싱 후 최소 minPct 이상만(기본 0 = 전부).
 */
export function parseYahooDayGainersJson(json: unknown, minPct = 0): UsDayGainerQuote[] {
  const quotes = (json as { finance?: { result?: { quotes?: unknown[] }[] } }).finance?.result?.[0]
    ?.quotes;
  if (!Array.isArray(quotes)) return [];

  const out: UsDayGainerQuote[] = [];
  for (const q of quotes) {
    if (!q || typeof q !== "object") continue;
    const o = q as Record<string, unknown>;
    const sym = o.symbol;
    if (typeof sym !== "string" || !sym) continue;

    const pct = coerceYahooNumber(o.regularMarketChangePercent);
    if (pct == null || !Number.isFinite(pct) || pct < minPct) continue;

    const shortName = typeof o.shortName === "string" ? o.shortName : null;
    const longName = typeof o.longName === "string" ? o.longName : null;
    const price = coerceYahooNumber(o.regularMarketPrice);
    const volumeRaw = coerceYahooNumber(o.regularMarketVolume);
    const volume =
      volumeRaw != null && Number.isFinite(volumeRaw) ? Math.floor(volumeRaw) : null;

    out.push({
      symbol: sym,
      shortName,
      longName,
      regularMarketChangePercent: Math.round(pct * 100) / 100,
      regularMarketPrice: price,
      regularMarketVolume: volume,
    });
  }

  out.sort((a, b) => b.regularMarketChangePercent - a.regularMarketChangePercent);
  return out;
}
