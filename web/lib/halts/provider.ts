/**
 * Halt 데이터 소스 추상화.
 *
 * 현재 프로덕션: `nasdaq-rss`
 * - 공식 RSS는 거래일 기준 약 1분마다 갱신되며, 1분보다 잦은 폴링을 금지한다.
 * - 0.1초~1초 실시간은 RSS로는 불가능하다.
 *
 * 초단위·틱 단위가 필요하면 WebSocket 계열로 교체:
 * - Polygon.io  (stocks / trade status — 유료 플랜·상품 확인 필요)
 * - Alpaca      (market data; halt 전용 피드 여부는 플랜별 확인)
 * - Direct NASDAQ proprietary feeds (유료)
 *
 * 교체 시 `getTradeHaltsCached()` 내부만 provider 구현체로 바꾸면
 * `/api/halts` · 프론트는 그대로 유지할 수 있다.
 */

export type HaltDataProviderId = "nasdaq-rss" | "polygon-ws" | "alpaca-ws";

export const ACTIVE_HALT_PROVIDER: HaltDataProviderId =
  (process.env.HALT_DATA_PROVIDER as HaltDataProviderId | undefined) ?? "nasdaq-rss";

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
