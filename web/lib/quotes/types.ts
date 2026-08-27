export type TickerQuote = {
  ticker: string;
  lastPrice: number | null;
  changePct: number | null;
  currency: string | null;
  fetchedAt: string | null;
};

export type TickerQuoteMap = Record<string, TickerQuote>;
