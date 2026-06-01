export type NewsSortKey = "latest" | "all_views" | "hour_views";
export type NewsMarketKey = "all" | "us" | "kr";

export const NEWS_SORT_OPTIONS: { key: NewsSortKey; label: string }[] = [
  { key: "all_views", label: "전체조회순" },
  { key: "hour_views", label: "1시간조회순" },
  { key: "latest", label: "최신순" },
];

export const NEWS_MARKET_OPTIONS: { key: NewsMarketKey; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "us", label: "미국장" },
  { key: "kr", label: "한국장" },
];

export function parseSortKey(raw: string | undefined): NewsSortKey {
  if (raw === "all_views" || raw === "hour_views" || raw === "latest") return raw;
  return "latest";
}

export function parseMarketKey(raw: string | undefined): NewsMarketKey {
  if (raw === "us" || raw === "kr") return raw;
  return "all";
}

/** 티커·DB market 컬럼으로 시장 추정 */
export function inferStockMarket(
  ticker: string | null | undefined,
  dbMarket?: string | null
): "us" | "kr" | "unknown" {
  const m = dbMarket?.toLowerCase();
  if (m === "us" || m === "kr") return m;
  if (!ticker) return "unknown";
  if (/^\d{4,6}$/.test(ticker.trim())) return "kr";
  return "us";
}

export function formatNewsDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
