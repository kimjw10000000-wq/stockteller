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
  const meta = item.gemini_metadata;
  const code =
    item.stock_code ??
    item.stocks?.ticker ??
    (typeof meta?.stock_code === "string" ? meta.stock_code : "");
  const marketRaw =
    item.market_type ?? item.stocks?.market ?? meta?.market_type;
  let marketType: AdminMarketType = "us";
  if (marketRaw === "kr") marketType = "kr";
  else if (marketRaw === "us") marketType = "us";
  else if (/^\d{4,6}$/.test(code)) marketType = "kr";

  return {
    id: item.id,
    title: item.title ?? "",
    body: item.raw_content ?? "",
    marketType,
    stockName:
      item.stock_name ??
      item.stocks?.name ??
      (typeof meta?.stock_name === "string" ? meta.stock_name : ""),
    stockCode: code,
    coverImageUrl: getCoverImageUrl(item),
  };
}
