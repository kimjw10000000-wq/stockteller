export const WIRE_NEWS_PAGE_SIZE = 16;
export const WIRE_NEWS_MAX_PAGES = 10;

export type WireNewsFilter = "latest" | "gainers" | "losers";

export function parseWireNewsPage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number.parseInt(value ?? "1", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(WIRE_NEWS_MAX_PAGES, n);
}

export function parseWireNewsFilter(raw: string | string[] | undefined): WireNewsFilter {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === "gainers" || value === "losers") return value;
  return "latest";
}

export function newsSecHref(filter: WireNewsFilter, page = 1): string {
  const params = new URLSearchParams();
  if (filter !== "latest") params.set("filter", filter);
  if (page > 1) params.set("page", String(page));
  const q = params.toString();
  return q ? `/news-sec?${q}` : "/news-sec";
}
