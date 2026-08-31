export const WIRE_NEWS_PAGE_SIZE = 16;
/** Hard ceiling so a bad `page=` query cannot request an unbounded range. */
const PAGE_CEILING = 10_000;

export type WireNewsFilter = "latest" | "gainers" | "losers";

export function parseWireNewsPage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number.parseInt(value ?? "1", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(PAGE_CEILING, n);
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

export function searchNewsHref(query: string, page = 1): string {
  const params = new URLSearchParams();
  params.set("q", query);
  if (page > 1) params.set("page", String(page));
  return `/search?${params.toString()}`;
}

export type PageNavItem = number | "ellipsis";

/** Sliding window: 1 … neighbors … last */
export function visiblePageItems(current: number, total: number, neighbor = 2): PageNavItem[] {
  const last = Math.max(1, total);
  const cur = Math.min(Math.max(1, current), last);
  if (last <= 9) return Array.from({ length: last }, (_, i) => i + 1);

  const set = new Set<number>([1, last, cur]);
  for (let n = cur - neighbor; n <= cur + neighbor; n++) {
    if (n >= 1 && n <= last) set.add(n);
  }
  const sorted = [...set].sort((a, b) => a - b);
  const out: PageNavItem[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const n = sorted[i]!;
    if (i > 0 && n - sorted[i - 1]! > 1) out.push("ellipsis");
    out.push(n);
  }
  return out;
}
