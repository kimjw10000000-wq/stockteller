import type { DisclosureWithStock } from "@/lib/types";
import { isManualEditorPost } from "@/lib/manual-post";
import { inferStockMarket } from "@/lib/news-sort";

export type NewsTrend = "up" | "down" | "neutral";

export function disclosureTrend(sentiment: DisclosureWithStock["sentiment"]): NewsTrend {
  if (sentiment === "positive") return "up";
  if (sentiment === "negative") return "down";
  return "neutral";
}

export function disclosureStockLabel(item: DisclosureWithStock): {
  stock: string;
  name: string;
  market: ReturnType<typeof inferStockMarket>;
} {
  if (isManualEditorPost(item)) {
    return { stock: "편집", name: "사이트 소식", market: "unknown" };
  }
  const ticker = item.stocks?.ticker ?? "—";
  const name = item.stocks?.name ?? "종목 미상";
  const market = inferStockMarket(ticker, item.stocks?.market ?? null);
  return { stock: ticker, name, market };
}

export function matchesSearchQuery(item: DisclosureWithStock, qLower: string): boolean {
  if (!qLower) return true;
  const blob = [
    item.title,
    item.summary,
    item.raw_content,
    item.stocks?.name,
    item.stocks?.ticker,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return blob.includes(qLower);
}

export function matchesMarketFilter(
  item: DisclosureWithStock,
  market: "all" | "us" | "kr"
): boolean {
  if (market === "all") return true;
  const { market: m } = disclosureStockLabel(item);
  if (m === "unknown") return true;
  return m === market;
}
