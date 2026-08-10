import { isTossConfigured } from "@/lib/toss/client";
import { fetchNasdaqTradeHalts, type TradeHaltsResult } from "./nasdaq-trade-halts";
import { ACTIVE_HALT_PROVIDER, getHaltProviderMeta } from "./provider";
import {
  enrichHaltsWithTossStocks,
  fetchTossCircuitEvents,
} from "./toss-circuit";
import { haltEventMs } from "./elapsed";

/**
 * NASDAQ Trade Halt RSS 공식 가이드:
 * "Data is updated … once a minute. Please do not query … more than once a minute."
 * → 업스트림 폴링은 55~60초 미만으로 두지 않는다.
 */
export const NASDAQ_RSS_MIN_INTERVAL_MS = 60_000;
const UPSTREAM_TTL_MS = 55_000;

export type HaltsCachePayload = TradeHaltsResult & {
  /** true면 이번 응답이 메모리 캐시 hit */
  servedFromCache: boolean;
  /** 업스트림을 마지막으로 받은 뒤 경과(ms) */
  upstreamAgeMs: number;
  /** 다음 업스트림 허용까지 남은 시간(ms) */
  upstreamRetryAfterMs: number;
  /** 서버가 외부(RSS)를 폴링하는 최소 간격 */
  upstreamPollIntervalMs: number;
  relay: "server-memory";
};

type CacheEntry = {
  data: TradeHaltsResult;
  fetchedAtMs: number;
};

let cache: CacheEntry | null = null;
let inflight: Promise<TradeHaltsResult> | null = null;

function mergeAndSort(
  nasdaq: TradeHaltsResult | null,
  toss: TradeHaltsResult | null
): TradeHaltsResult {
  const items = [...(nasdaq?.items ?? []), ...(toss?.items ?? [])];
  items.sort((a, b) => {
    const d = haltEventMs(b) - haltEventMs(a);
    if (d !== 0) return d;
    return a.symbol.localeCompare(b.symbol);
  });
  return {
    items,
    fetchedAt: new Date().toISOString(),
    source: nasdaq && toss ? "hybrid" : toss ? "toss-vi" : "nasdaq-rss",
    count: items.length,
  };
}

async function fetchUpstream(): Promise<TradeHaltsResult> {
  const provider = ACTIVE_HALT_PROVIDER;
  const tossOn = isTossConfigured();

  if (provider === "toss-vi") {
    return fetchTossCircuitEvents();
  }

  if (provider === "hybrid" || (provider === "nasdaq-rss" && tossOn)) {
    const [rssSettled, tossSettled] = await Promise.allSettled([
      fetchNasdaqTradeHalts(),
      provider === "hybrid" && tossOn
        ? fetchTossCircuitEvents()
        : Promise.resolve(null as TradeHaltsResult | null),
    ]);

    let nasdaq =
      rssSettled.status === "fulfilled" ? rssSettled.value : null;
    const toss =
      tossSettled.status === "fulfilled" ? tossSettled.value : null;

    if (nasdaq && tossOn) {
      try {
        nasdaq = {
          ...nasdaq,
          items: await enrichHaltsWithTossStocks(nasdaq.items),
        };
      } catch {
        /* keep raw RSS names */
      }
    }

    if (!nasdaq && !toss) {
      if (rssSettled.status === "rejected") throw rssSettled.reason;
      throw new Error("Halt upstream empty");
    }

    // nasdaq-rss + toss enrich only (no VI merge) when provider is nasdaq-rss
    if (provider === "nasdaq-rss") {
      return (
        nasdaq ?? {
          items: [],
          fetchedAt: new Date().toISOString(),
          source: "nasdaq-rss",
          count: 0,
        }
      );
    }

    return mergeAndSort(nasdaq, toss);
  }

  return fetchNasdaqTradeHalts();
}

async function refreshUpstream(): Promise<TradeHaltsResult> {
  if (inflight) return inflight;

  inflight = fetchUpstream()
    .then((data) => {
      cache = { data, fetchedAtMs: Date.now() };
      return data;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

function toPayload(data: TradeHaltsResult, servedFromCache: boolean): HaltsCachePayload {
  const fetchedAtMs = cache?.fetchedAtMs ?? Date.now();
  const upstreamAgeMs = Math.max(0, Date.now() - fetchedAtMs);
  const meta = getHaltProviderMeta();
  return {
    ...data,
    servedFromCache,
    upstreamAgeMs,
    upstreamRetryAfterMs: Math.max(0, UPSTREAM_TTL_MS - upstreamAgeMs),
    upstreamPollIntervalMs: meta.minUpstreamIntervalMs,
    relay: "server-memory",
  };
}

/**
 * 모든 유저 요청은 이 함수만 탄다.
 * - TTL 안: 메모리 즉시 반환
 * - TTL 만료: 프로세스당 1개의 업스트림 fetch만 실행 (single-flight)
 */
export async function getTradeHaltsCached(options?: {
  force?: boolean;
}): Promise<HaltsCachePayload> {
  const now = Date.now();
  const age = cache ? now - cache.fetchedAtMs : Infinity;
  const fresh = cache != null && age < UPSTREAM_TTL_MS;

  if (fresh && !options?.force) {
    return toPayload(cache!.data, true);
  }

  if (options?.force && cache && age < UPSTREAM_TTL_MS) {
    return toPayload(cache.data, true);
  }

  try {
    const data = await refreshUpstream();
    return toPayload(data, false);
  } catch (e) {
    if (cache) {
      return toPayload(cache.data, true);
    }
    throw e;
  }
}
