import type { DisclosureWithStock } from "@/lib/types";

/** 검색어·필드 공통 정규화 — 대소문자·연속 공백·전각 공백 무시 */
export function normalizeSearchText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, "");
}

/** disclosures 행에서 종목 검색 대상 문자열 수집 (컬럼·metadata·stocks 조인) */
export function getDisclosureStockSearchFields(item: DisclosureWithStock): string[] {
  const meta = item.gemini_metadata;
  const fromMeta =
    meta?.source === "admin_publish" || meta?.source === "manual_editor"
      ? [meta.stock_name, meta.stock_code, meta.ticker]
      : [];

  return [
    item.stock_name,
    item.stock_code,
    item.stocks?.name,
    item.stocks?.ticker,
    ...fromMeta,
  ]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim());
}

/** 종목 필드만 검색 (제목·본문 제외) */
export function matchesStockSearchQuery(item: DisclosureWithStock, rawQuery: string): boolean {
  const normalizedQuery = normalizeSearchText(rawQuery);
  if (!normalizedQuery) return true;

  const fields = getDisclosureStockSearchFields(item);
  return fields.some((field) => normalizeSearchText(field).includes(normalizedQuery));
}
