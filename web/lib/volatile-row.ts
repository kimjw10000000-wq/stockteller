export type VolatileRow = {
  id: string;
  market: string;
  ticker: string;
  name: string | null;
  currency: string;
  last_price: number | null;
  prev_close: number | null;
  change_pct: number | null;
  volume: number | null;
  source: string | null;
  updated_at: string;
};
