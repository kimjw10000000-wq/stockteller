/**
 * Halt 데이터 소스 추상화.
 *
 * - nasdaq-rss: NASDAQ Trade Halt RSS (미국 Halt/Resume 전체 피드)
 * - toss-vi: 토스 랭킹 후보 + warnings(VI/유의) + 거래정지 플래그 스캔
 * - hybrid: RSS + Toss VI 병합 (Toss 키 있으면 기본)
 */

export type HaltDataProviderId = "nasdaq-rss" | "toss-vi" | "hybrid" | "polygon-ws" | "alpaca-ws";

function resolveDefaultProvider(): HaltDataProviderId {
  const env = process.env.HALT_DATA_PROVIDER?.trim() as HaltDataProviderId | undefined;
  if (env) return env;
  const toss =
    Boolean(process.env.TOSSINVEST_CLIENT_ID?.trim()) &&
    Boolean(process.env.TOSSINVEST_CLIENT_SECRET?.trim());
  return toss ? "hybrid" : "nasdaq-rss";
}

export const ACTIVE_HALT_PROVIDER: HaltDataProviderId = resolveDefaultProvider();

export type HaltProviderMeta = {
  id: HaltDataProviderId;
  label: string;
  /** 업스트림이 실제로 새 데이터를 줄 수 있는 최소 간격 */
  minUpstreamIntervalMs: number;
  supportsSubSecond: boolean;
  notes: string;
};

export function getHaltProviderMeta(id: HaltDataProviderId = ACTIVE_HALT_PROVIDER): HaltProviderMeta {
  switch (id) {
    case "toss-vi":
      return {
        id,
        label: "Toss Open API (VI/유의/정지)",
        minUpstreamIntervalMs: 15_000,
        supportsSubSecond: false,
        notes:
          "종목별 warnings + 랭킹 스캔. 미국 전체 Halt 피드는 아님. TOSSINVEST_* 및 허용 IP 필요.",
      };
    case "hybrid":
      return {
        id,
        label: "NASDAQ RSS + Toss VI",
        minUpstreamIntervalMs: 55_000,
        supportsSubSecond: false,
        notes:
          "미국 Halt/Resume은 NASDAQ RSS, VI/유의·종목명·시장은 Toss로 보강/병합. 최신순 정렬.",
      };
    case "polygon-ws":
      return {
        id,
        label: "Polygon WebSocket",
        minUpstreamIntervalMs: 0,
        supportsSubSecond: true,
        notes: "POLYGON_API_KEY + WS 구독 루프를 장기 실행 워커에 두고, API route는 공유 메모리를 읽는다.",
      };
    case "alpaca-ws":
      return {
        id,
        label: "Alpaca WebSocket",
        minUpstreamIntervalMs: 0,
        supportsSubSecond: true,
        notes: "ALPACA_API_KEY/SECRET + trade/status 채널. 서버리스 대신 상시 프로세스 권장.",
      };
    case "nasdaq-rss":
    default:
      return {
        id: "nasdaq-rss",
        label: "NASDAQ Trade Halt RSS",
        minUpstreamIntervalMs: 60_000,
        supportsSubSecond: false,
        notes: "무료. 1분 갱신·1분 1회 폴링 가이드. 서버 메모리 중계로 유저 트래픽과 분리.",
      };
  }
}
