import type { UsDayGainerQuote } from "./us-day-gainer-types";

function alphavantageApiKey(): string | undefined {
  const k =
    process.env.ALPHA_VANTAGE_API_KEY?.trim() || process.env.ALPHAVANTAGE_API_KEY?.trim();
  return k || undefined;
}

/** 디버깅: Vercel에 키가 주입됐는지(값 노출 없음). */
export function isAlphaVantageConfigured(): boolean {
  return Boolean(alphavantageApiKey());
}

function parseAvChangePct(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const s = String(raw ?? "")
    .replace(/%/g, "")
    .replace(/\+/g, "")
    .replace(/,/g, "")
    .trim();
  if (!s) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function parseAvNumber(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const n = parseFloat(String(raw ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseAvInt(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.floor(raw);
  const n = parseInt(String(raw ?? "").replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

export async function fetchAlphaVantageTopGainersAll(): Promise<UsDayGainerQuote[]> {
  const key = alphavantageApiKey();
  if (!key) return [];

  const u = new URL("https://www.alphavantage.co/query");
  u.searchParams.set("function", "TOP_GAINERS_LOSERS");
  u.searchParams.set("apikey", key);

  let res: Response;
  try {
    res = await fetch(u.toString(), {
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    return [];
  }
  if (!res.ok) return [];

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return [];
  }

  const o = json as Record<string, unknown>;
  if (typeof o.Note === "string") return [];
  if (typeof o["Error Message"] === "string") return [];

  const gainers = o.top_gainers;
  if (!Array.isArray(gainers)) return [];

  const out: UsDayGainerQuote[] = [];
  for (const row of gainers) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const sym = String(r.ticker ?? "").trim();
    if (!sym) continue;

    const pct = parseAvChangePct(r.change_percentage);
    if (pct == null) continue;

    const price = parseAvNumber(r.price);
    const vol = parseAvInt(r.volume);

    out.push({
      symbol: sym,
      shortName: null,
      longName: null,
      regularMarketChangePercent: Math.round(pct * 100) / 100,
      regularMarketPrice: price,
      regularMarketVolume: vol,
    });
  }

  out.sort((a, b) => b.regularMarketChangePercent - a.regularMarketChangePercent);
  return out;
}

/** @deprecated minPct 필터는 호출 측에서 — 호환용 */
export async function fetchAlphaVantageTopGainersMinPct(minPct: number): Promise<UsDayGainerQuote[]> {
  const all = await fetchAlphaVantageTopGainersAll();
  return all.filter((x) => x.regularMarketChangePercent >= minPct);
}
