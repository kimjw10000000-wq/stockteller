import { sleep } from "@/lib/sec/edgar-client";

/**
 * Batch market-cap enrichment.
 * Prefer Yahoo quote batches; fall back to Finnhub profile when configured.
 */

async function yahooMarketCaps(symbols: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!symbols.length) return map;

  const url = new URL("https://query1.finance.yahoo.com/v7/finance/quote");
  url.searchParams.set("symbols", symbols.join(","));
  url.searchParams.set("fields", "symbol,marketCap");

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent":
        process.env.SEC_USER_AGENT?.trim() ||
        "Mozilla/5.0 (compatible; WhyUp/1.0; admin@whyup.net)",
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) return map;

  const json = (await res.json()) as {
    quoteResponse?: { result?: Array<{ symbol?: string; marketCap?: number }> };
  };
  for (const q of json.quoteResponse?.result ?? []) {
    const sym = String(q.symbol ?? "")
      .trim()
      .toUpperCase()
      .replace(/\./g, "-");
    if (sym && typeof q.marketCap === "number" && Number.isFinite(q.marketCap) && q.marketCap > 0) {
      map.set(sym, q.marketCap);
    }
  }
  return map;
}

async function finnhubMarketCap(symbol: string): Promise<number | null> {
  const key = process.env.FINNHUB_API_KEY?.trim();
  if (!key) return null;
  const u = new URL("https://finnhub.io/api/v1/stock/profile2");
  u.searchParams.set("symbol", symbol.replace(/-/g, "."));
  u.searchParams.set("token", key);
  const res = await fetch(u, { cache: "no-store" });
  if (!res.ok) return null;
  const j = (await res.json()) as { marketCapitalization?: number };
  // Finnhub returns millions
  if (typeof j.marketCapitalization === "number" && j.marketCapitalization > 0) {
    return j.marketCapitalization * 1_000_000;
  }
  return null;
}

export async function fetchMarketCaps(
  symbols: string[],
  opts?: { preferFinnhubFallback?: boolean }
): Promise<Map<string, number>> {
  const unique = Array.from(
    new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))
  );
  const map = await yahooMarketCaps(unique);

  if (!opts?.preferFinnhubFallback) return map;

  const missing = unique.filter((s) => !map.has(s));
  for (const sym of missing.slice(0, 40)) {
    const cap = await finnhubMarketCap(sym);
    if (cap != null) map.set(sym, cap);
    await sleep(1100); // free-tier friendly
  }
  return map;
}
