import { requireTossConfigured, tossFetch } from "./client";
import { parseRankingsPage } from "./parse";
import type { TossMarketCountry, TossRankingsPage } from "./types";

export type TossRankingType =
  | "TOP_GAINERS"
  | "TOP_LOSERS"
  | "MARKET_TRADING_VOLUME"
  | "MARKET_TRADING_AMOUNT"
  | string;

export type TossRankingDuration = "1d" | "realtime" | "1w" | "1m" | string;

/** GET /api/v1/rankings */
export async function fetchTossRankings(params: {
  type: TossRankingType;
  marketCountry: TossMarketCountry;
  duration: TossRankingDuration;
  count?: number;
}): Promise<TossRankingsPage> {
  requireTossConfigured();
  const data = await tossFetch<unknown>("/api/v1/rankings", {
    searchParams: {
      type: params.type,
      marketCountry: params.marketCountry,
      duration: params.duration,
      count: String(Math.min(Math.max(params.count ?? 30, 1), 100)),
    },
  });
  return parseRankingsPage(
    {
      marketCountry: params.marketCountry,
      type: params.type,
      duration: params.duration,
    },
    data
  );
}

/** US movers convenience */
export async function fetchUsRankingsBundle(count = 50): Promise<{
  topGainers: TossRankingsPage | null;
  topLosers: TossRankingsPage | null;
  volume: TossRankingsPage | null;
  errors: string[];
}> {
  const errors: string[] = [];
  const run = async (type: TossRankingType, duration: TossRankingDuration) => {
    try {
      return await fetchTossRankings({
        type,
        marketCountry: "US",
        duration,
        count,
      });
    } catch (e) {
      errors.push(`${type}: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  };

  const [topGainers, topLosers, volume] = await Promise.all([
    run("TOP_GAINERS", "1d"),
    run("TOP_LOSERS", "1d"),
    run("MARKET_TRADING_VOLUME", "realtime"),
  ]);

  return { topGainers, topLosers, volume, errors };
}
