import { polygonStarterKeyOrNull } from "@/lib/us-market/polygon-keys";
import { sleep } from "@/lib/sec/edgar-client";

export type PolygonTickerCik = {
  ticker: string;
  cik: string;
  name: string;
};

function padCik(raw: string): string | null {
  const cik = raw.replace(/\D/g, "").padStart(10, "0");
  if (!cik || cik === "0000000000") return null;
  return cik;
}

function lookupSymbols(ticker: string): string[] {
  const dotted = ticker.replace(/-/g, ".");
  const out = [ticker];
  if (dotted !== ticker) out.push(dotted);
  return out;
}

async function lookupSymbol(symbol: string, key: string): Promise<PolygonTickerCik | null> {
  const res = await fetch(`https://api.polygon.io/v3/reference/tickers/${encodeURIComponent(symbol)}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (res.status === 429 || res.status >= 500) {
    throw new Error(`Polygon HTTP ${res.status}`);
  }
  if (!res.ok) return null;
  const payload = (await res.json()) as {
    results?: { ticker?: string; cik?: string; name?: string };
  };
  const cik = padCik(String(payload.results?.cik ?? ""));
  if (!cik) return null;
  return {
    ticker: symbol,
    cik,
    name: String(payload.results?.name ?? "").trim(),
  };
}

async function lookupOne(ticker: string, key: string): Promise<PolygonTickerCik | null> {
  for (const symbol of lookupSymbols(ticker)) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const hit = await lookupSymbol(symbol, key);
        if (hit) return { ...hit, ticker };
        break;
      } catch {
        await sleep(500 * 2 ** attempt);
      }
    }
  }
  return null;
}

export async function fetchPolygonTickerCiks(tickers: string[]): Promise<Map<string, PolygonTickerCik>> {
  const out = new Map<string, PolygonTickerCik>();
  const key = polygonStarterKeyOrNull();
  if (!key) return out;
  const total = tickers.length;
  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i];
    if (!ticker) continue;
    const hit = await lookupOne(ticker, key);
    if (hit) out.set(ticker, hit);
    if ((i + 1) % 25 === 0 || i + 1 === total) {
      console.log(`[us-listed-sync] polygon cik ${i + 1}/${total} hit=${out.size}`);
    }
    await sleep(50);
  }
  return out;
}
