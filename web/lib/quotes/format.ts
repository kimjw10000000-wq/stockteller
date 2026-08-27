import type { WireNewsRow } from "@/lib/gnw/types";

export function wireNewsTicker(item: WireNewsRow): string {
  return (item.primary_ticker || item.tickers?.[0] || "").trim().toUpperCase();
}

export function uniqueWireNewsTickers(items: WireNewsRow[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const ticker = wireNewsTicker(item);
    if (!ticker || seen.has(ticker)) continue;
    seen.add(ticker);
    out.push(ticker);
  }
  return out;
}

export function formatChangePct(changePct: number): string {
  const sign = changePct >= 0 ? "+" : "";
  return `${sign}${changePct.toFixed(2)}%`;
}
