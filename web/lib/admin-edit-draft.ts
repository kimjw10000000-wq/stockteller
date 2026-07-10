"use client";

import type { DisclosureWithStock } from "@/lib/types";
import type { AdminMarketType } from "@/lib/admin-publish-market";
import { getCoverImageUrl } from "@/lib/manual-post";

export type AdminEditDraft = {
  id: string;
  title: string;
  body: string;
  marketType: AdminMarketType;
  stockName: string;
  stockCode: string;
  coverImageUrl: string | null;
};

export function disclosureToEditDraft(item: DisclosureWithStock): AdminEditDraft {
  const code = item.stock_code ?? item.stocks?.ticker ?? "";
  const marketRaw = item.market_type ?? item.stocks?.market ?? item.gemini_metadata?.market_type;
  let marketType: AdminMarketType = "us";
  if (marketRaw === "kr") marketType = "kr";
  else if (marketRaw === "us") marketType = "us";
  else if (/^\d{4,6}$/.test(code)) marketType = "kr";

  return {
    id: item.id,
    title: item.title ?? "",
    body: item.raw_content ?? "",
    marketType,
    stockName: item.stock_name ?? item.stocks?.name ?? "",
    stockCode: item.stock_code ?? item.stocks?.ticker ?? "",
    coverImageUrl: getCoverImageUrl(item),
  };
}
