import type { UsaScreenerHit } from "./types";

const DEFAULT_THRESHOLD_PCT = 20;

/**
 * 미국 주식: 전일 종가 대비 등락률이 threshold 이상일 때만 반환.
 * 등락률 = (현재가 - 전일종가) / 전일종가 * 100
 */
export function detectUsaScreener(
  input: {
    ticker: string;
    lastPrice: number;
    prevClose: number;
    volume: number;
    thresholdPct?: number;
  }
): UsaScreenerHit | null {
  const { ticker, lastPrice, prevClose, volume } = input;
  const thresholdPct = input.thresholdPct ?? DEFAULT_THRESHOLD_PCT;

  if (!Number.isFinite(lastPrice) || !Number.isFinite(prevClose) || prevClose <= 0) {
    return null;
  }
  if (!Number.isFinite(volume) || volume < 0) {
    return null;
  }

  const changePct = ((lastPrice - prevClose) / prevClose) * 100;
  if (changePct < thresholdPct) {
    return null;
  }

  return {
    ticker: ticker.toUpperCase(),
    price: lastPrice,
    changePct: Math.round(changePct * 100) / 100,
    volume: Math.floor(volume),
  };
}
