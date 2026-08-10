import { tossFetch } from "./client";

function unwrapResult<T>(data: unknown): T {
  if (data && typeof data === "object" && "result" in data) {
    return (data as { result: T }).result;
  }
  return data as T;
}

export type TossStockInfo = {
  symbol: string;
  name: string;
  englishName: string;
  isinCode: string;
  market: string;
  securityType: string;
  isCommonShare: boolean;
  status: string;
  currency: string;
  listDate: string | null;
  delistDate: string | null;
  sharesOutstanding: string;
  leverageFactor: string | null;
  koreanMarketDetail: {
    liquidationTrading?: boolean;
    nxtSupported?: boolean;
    krxTradingSuspended?: boolean;
    nxtTradingSuspended?: boolean;
  } | null;
};

export type TossStockWarning = {
  warningType: string;
  exchange: string | null;
  startDate: string | null;
  endDate: string | null;
};

export type TossRankingRow = {
  rank: number;
  symbol: string;
  currency: string;
  price?: {
    lastPrice?: string;
    basePrice?: string;
    changeRate?: string;
  };
  tradingVolume?: string;
  tradingAmount?: string;
};

export type TossRankingsPage = {
  rankedAt: string | null;
  rankings: TossRankingRow[];
};

export type TossMarketCalendar = {
  today: Record<string, unknown>;
  previousBusinessDay?: Record<string, unknown>;
  nextBusinessDay?: Record<string, unknown>;
};

export async function fetchTossStocks(symbols: string[]): Promise<TossStockInfo[]> {
  const list = Array.from(
    new Set(symbols.map((s) => s.trim()).filter(Boolean))
  ).slice(0, 200);
  if (!list.length) return [];
  const data = await tossFetch<unknown>("/api/v1/stocks", {
    searchParams: { symbols: list.join(",") },
  });
  const result = unwrapResult<TossStockInfo[] | { stocks?: TossStockInfo[] }>(data);
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && Array.isArray(result.stocks)) return result.stocks;
  return [];
}

export async function fetchTossStockWarnings(symbol: string): Promise<TossStockWarning[]> {
  const s = symbol.trim();
  if (!s) return [];
  const data = await tossFetch<unknown>(`/api/v1/stocks/${encodeURIComponent(s)}/warnings`);
  const result = unwrapResult<TossStockWarning[]>(data);
  return Array.isArray(result) ? result : [];
}

export async function fetchTossRankings(params: {
  type: string;
  marketCountry: "KR" | "US";
  duration: string;
  count?: number;
}): Promise<TossRankingsPage> {
  const data = await tossFetch<unknown>("/api/v1/rankings", {
    searchParams: {
      type: params.type,
      marketCountry: params.marketCountry,
      duration: params.duration,
      count: String(Math.min(Math.max(params.count ?? 30, 1), 100)),
    },
  });
  const result = unwrapResult<TossRankingsPage>(data);
  return {
    rankedAt: result?.rankedAt ?? null,
    rankings: Array.isArray(result?.rankings) ? result.rankings : [],
  };
}

export async function fetchTossMarketCalendar(
  country: "KR" | "US",
  date?: string
): Promise<TossMarketCalendar> {
  const data = await tossFetch<unknown>(`/api/v1/market-calendar/${country}`, {
    searchParams: date ? { date } : undefined,
  });
  return unwrapResult<TossMarketCalendar>(data);
}

/** Map symbol → stock info (batch). */
export async function fetchTossStockMap(
  symbols: string[]
): Promise<Map<string, TossStockInfo>> {
  const map = new Map<string, TossStockInfo>();
  const unique = Array.from(
    new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))
  );
  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200);
    try {
      const rows = await fetchTossStocks(chunk);
      for (const row of rows) {
        map.set(row.symbol.trim().toUpperCase(), row);
      }
    } catch {
      /* partial enrich OK */
    }
  }
  return map;
}
