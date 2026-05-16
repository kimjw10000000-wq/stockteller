import type { UsDayGainerQuote } from "./us-day-gainer-types";

function finnhubToken(): string | undefined {
  const k = process.env.FINNHUB_API_KEY?.trim();
  return k || undefined;
}

/** Finnhub US 심볼 관례(예: BRK.A → BRK-A). */
export function toFinnhubUsSymbol(yahooSymbol: string): string {
  return yahooSymbol.trim().toUpperCase().replace(/\./g, "-");
}

/**
 * Yahoo 스크리너 후보에 대해 Finnhub /quote의 c·dp(전일 대비 %)를 반영해 장중 값에 가깝게 맞춘다.
 * 무료 플랜은 호출 수·지연(거래소별)이 있을 수 있어 상한을 둔다.
 */
export async function refineGainersWithFinnhubQuotes(
  candidates: UsDayGainerQuote[],
  minPct: number,
  maxSymbols: number
): Promise<{ items: UsDayGainerQuote[]; refined: boolean }> {
  const token = finnhubToken();
  if (!token || candidates.length === 0) {
    return { items: candidates, refined: false };
  }

  const slice = candidates.slice(0, maxSymbols);
  const rest = candidates.slice(maxSymbols);

  const chunkSize = 10;
  const merged: UsDayGainerQuote[] = [];

  for (let i = 0; i < slice.length; i += chunkSize) {
    const part = slice.slice(i, i + chunkSize);
    const batch = await Promise.all(
      part.map(async (q) => {
        const u = new URL("https://finnhub.io/api/v1/quote");
        u.searchParams.set("symbol", toFinnhubUsSymbol(q.symbol));
        u.searchParams.set("token", token);
        try {
          const res = await fetch(u.toString(), {
            cache: "no-store",
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok) return q;
          const j = (await res.json()) as { c?: unknown; dp?: unknown };
          const dp = typeof j.dp === "number" && Number.isFinite(j.dp) ? j.dp : null;
          const c = typeof j.c === "number" && Number.isFinite(j.c) ? j.c : null;
          if (dp == null) return q;
          return {
            ...q,
            regularMarketChangePercent: Math.round(dp * 100) / 100,
            regularMarketPrice: c != null ? c : q.regularMarketPrice,
          };
        } catch {
          return q;
        }
      })
    );
    merged.push(...batch);
    if (i + chunkSize < slice.length) {
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  const withTail = [...merged, ...rest];
  const afterFilter = withTail
    .filter((x) => x.regularMarketChangePercent >= minPct)
    .sort((a, b) => b.regularMarketChangePercent - a.regularMarketChangePercent);

  if (afterFilter.length > 0) {
    return { items: afterFilter, refined: true };
  }

  return { items: candidates, refined: false };
}
