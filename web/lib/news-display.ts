import type { DisclosureWithStock } from "@/lib/types";
import { isManualEditorPost } from "@/lib/manual-post";
import { inferStockMarket } from "@/lib/news-sort";

export { matchesStockSearchQuery } from "@/lib/stock-search";

export type NewsTrend = "up" | "down" | "neutral";

function adminPublishStockMeta(item: DisclosureWithStock): {
  stock: string;
  name: string;
  market: "us" | "kr" | null;
} | null {
  const meta = item.gemini_metadata;
  if (meta?.source !== "admin_publish") return null;
  const code = typeof meta.stock_code === "string" ? meta.stock_code : null;
  if (!code) return null;
  const name = typeof meta.stock_name === "string" ? meta.stock_name : code;
  const mt = meta.market_type;
  const market = mt === "us" || mt === "kr" ? mt : null;
  return { stock: code, name, market };
}

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

  const adminMeta = adminPublishStockMeta(item);
  if (adminMeta?.market) return adminMeta.market;
  if (adminMeta?.stock) {
    return inferStockMarket(adminMeta.stock, adminMeta.market);
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

  const adminMeta = adminPublishStockMeta(item);
  if (adminMeta) {
    return {
      stock: adminMeta.stock,
      name: adminMeta.name,
      market: adminMeta.market ?? disclosureMarket(item),
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

export function matchesMarketFilter(
  item: DisclosureWithStock,
  market: "all" | "us" | "kr"
): boolean {
  if (market === "all") return true;
  return disclosureMarket(item) === market;
}
