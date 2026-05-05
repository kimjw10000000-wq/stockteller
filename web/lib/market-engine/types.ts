export type Market = "US" | "KR" | "JP";

export type DataSource = "finnhub" | "kis" | "jquants";

/** 3개국 수집 데이터 공통 규격 */
export interface StockData {
  market: Market;
  ticker: string;
  name?: string;
  currency: string;
  lastPrice: number;
  prevClose: number;
  /** (lastPrice - prevClose) / prevClose * 100 */
  changePct: number;
  volume: number;
  exchange?: string;
  /** Unix ms */
  timestamp: number;
  source: DataSource;
  raw?: unknown;
}

export type UsaScreenerHit = {
  ticker: string;
  price: number;
  changePct: number;
  volume: number;
};
