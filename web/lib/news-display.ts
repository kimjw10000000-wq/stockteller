import type { DisclosureWithStock } from "@/lib/types";
import { isManualEditorPost } from "@/lib/manual-post";
import { inferStockMarket } from "@/lib/news-sort";

export type NewsTrend = "up" | "down" | "neutral";

export function disclosureTrend(sentiment: DisclosureWithStock["sentiment"]): NewsTrend {
  if (sentiment === "positive") return "up";
  if (sentiment === "negative") return "down";
  return "neutral";
}

/** 시장 분류 — market_type 컬럼 우선, 없으면 stocks 조인·티커 추정 */
export function disclosureMarket(item: DisclosureWithStock): "us" | "kr" | "unknown" {
  const mt = item.market_type?.toLowerCase();
  if (mt === "us" || mt === "kr") return mt;

  if (item.stocks?.ticker) {
    return inferStockMarket(item.stocks.ticker, item.stocks.market ?? null);
  }

  if (item.stock_code) {
    return inferStockMarket(item.stock_code, item.market_type ?? null);
  }

  return "unknown";
}

export function disclosureStockLabel(item: DisclosureWithStock): {
  stock: string;
  name: string;
  market: ReturnType<typeof disclosureMarket>;
} {
  if (item.market_type && item.stock_code) {
    return {
      stock: item.stock_code,
      name: item.stock_name ?? item.stock_code,
      market: item.market_type,
    };
  }

  if (isManualEditorPost(item)) {
    return { stock: "편집", name: "사이트 소식", market: "unknown" };
  }

  const ticker = item.stocks?.ticker ?? "—";
  const name = item.stocks?.name ?? "종목 미상";
  const market = disclosureMarket(item);
  return { stock: ticker, name, market };
}

/** 종목 필드만 검색 (제목·본문 제외) */
export function matchesStockSearchQuery(item: DisclosureWithStock, qLower: string): boolean {
  if (!qLower) return true;
  const fields = [item.stock_name, item.stock_code, item.stocks?.name, item.stocks?.ticker]
    .filter(Boolean)
    .map((v) => String(v).toLowerCase());
  return fields.some((v) => v.includes(qLower));
}

/** @deprecated matchesStockSearchQuery 사용 */
export function matchesSearchQuery(item: DisclosureWithStock, qLower: string): boolean {
  return matchesStockSearchQuery(item, qLower);
}

export function matchesMarketFilter(
  item: DisclosureWithStock,
  market: "all" | "us" | "kr"
): boolean {
  if (market === "all") return true;
  return disclosureMarket(item) === market;
}
