import { fetchNasdaqTradeHalts, type TradeHaltsResult } from "./nasdaq-trade-halts";

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

async function refreshUpstream(): Promise<TradeHaltsResult> {
  if (inflight) return inflight;

  inflight = fetchNasdaqTradeHalts()
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
  return {
    ...data,
    servedFromCache,
    upstreamAgeMs,
    upstreamRetryAfterMs: Math.max(0, UPSTREAM_TTL_MS - upstreamAgeMs),
    upstreamPollIntervalMs: NASDAQ_RSS_MIN_INTERVAL_MS,
    relay: "server-memory",
  };
}

/**
 * 모든 유저 요청은 이 함수만 탄다.
 * - TTL 안: 메모리 즉시 반환 (나스닥 호출 0)
 * - TTL 만료: 프로세스당 1개의 업스트림 fetch만 실행 (single-flight)
 */
export async function getTradeHaltsCached(options?: {
  /** true면 TTL을 무시하고 업스트림 재요청(단, 최소 간격은 준수) */
  force?: boolean;
}): Promise<HaltsCachePayload> {
  const now = Date.now();
  const age = cache ? now - cache.fetchedAtMs : Infinity;
  const fresh = cache != null && age < UPSTREAM_TTL_MS;

  if (fresh && !options?.force) {
    return toPayload(cache!.data, true);
  }

  // force여도 NASDAQ 1분 가이드를 깨지 않도록 최소 간격 보장
  if (options?.force && cache && age < UPSTREAM_TTL_MS) {
    return toPayload(cache.data, true);
  }

  try {
    const data = await refreshUpstream();
    return toPayload(data, false);
  } catch (e) {
    // 업스트림 실패 시 stale 캐시라도 반환
    if (cache) {
      return toPayload(cache.data, true);
    }
    throw e;
  }
}
