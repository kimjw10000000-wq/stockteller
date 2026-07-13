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

/** 한국 시간(KST, Asia/Seoul) 시·분 — 브라우저/서버 TZ와 무관 */
export function getKstHourMinute(now: Date = new Date()): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);

  let hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  // 일부 엔진은 자정을 24로 표기
  if (hour === 24) hour = 0;
  return { hour, minute };
}

/**
 * KST 기준 기본 시장 필터
 * - 09:00 ~ 16:00 (포함) → 한국장
 * - 그 외(16:01 ~ 다음날 08:59) → 미국장
 */
export function getDefaultMarketByKst(now: Date = new Date()): "us" | "kr" {
  const { hour, minute } = getKstHourMinute(now);
  const totalMinutes = hour * 60 + minute;
  const start = 9 * 60; // 09:00
  const end = 16 * 60; // 16:00
  if (totalMinutes >= start && totalMinutes <= end) return "kr";
  return "us";
}

export function parseSortKey(raw: string | undefined): NewsSortKey {
  if (raw === "all_views" || raw === "hour_views" || raw === "latest") return raw;
  return "latest";
}

export function parseMarketKey(raw: string | undefined): NewsMarketKey {
  if (raw === "us" || raw === "kr" || raw === "all") return raw;
  return getDefaultMarketByKst();
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
      timeZone: "Asia/Seoul",
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
