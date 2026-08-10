/**
 * Toss Invest Open API — shared TypeScript types (read / market data).
 * Official base: https://openapi.tossinvest.com
 */

export type TossCurrency = "KRW" | "USD" | string;
export type TossMarketCountry = "KR" | "US";
export type TossCandleInterval = "1m" | "1d";

export type TossWarningType =
  | "LIQUIDATION_TRADING"
  | "OVERHEATED"
  | "INVESTMENT_WARNING"
  | "INVESTMENT_RISK"
  | "VI_STATIC_AND_DYNAMIC"
  | "VI_STATIC"
  | "VI_DYNAMIC"
  | "STOCK_WARRANTS"
  | string;

export type TossStockStatus = "SCHEDULED" | "ACTIVE" | "DELISTED" | string;

export type TossKoreanMarketDetail = {
  liquidationTrading: boolean;
  nxtSupported: boolean;
  krxTradingSuspended: boolean;
  nxtTradingSuspended: boolean;
};

/** GET /api/v1/prices */
export type TossPriceRaw = {
  symbol: string;
  timestamp: string | null;
  lastPrice: string;
  currency: TossCurrency;
};

export type TossPriceNormalized = {
  symbol: string;
  timestamp: string | null;
  lastPrice: number | null;
  currency: TossCurrency | null;
  /** legacy aliases used by /api/market/quote */
  price: number | null;
  change: number | null;
  changePct: number | null;
  volume: number | null;
  raw: unknown;
};

/** GET /api/v1/orderbook */
export type TossOrderbookEntry = {
  price: number | null;
  volume: number | null;
  priceRaw: string;
  volumeRaw: string;
};

export type TossOrderbook = {
  symbol: string;
  timestamp: string | null;
  currency: TossCurrency | null;
  asks: TossOrderbookEntry[];
  bids: TossOrderbookEntry[];
  raw: unknown;
};

/** GET /api/v1/trades */
export type TossTrade = {
  symbol: string;
  price: number | null;
  volume: number | null;
  timestamp: string | null;
  currency: TossCurrency | null;
  raw: unknown;
};

/** GET /api/v1/candles */
export type TossCandleNormalized = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  currency: TossCurrency | null;
};

export type TossCandlePage = {
  symbol: string;
  interval: TossCandleInterval;
  candles: TossCandleNormalized[];
  nextBefore: string | null;
  raw: unknown;
};

/** GET /api/v1/price-limits */
export type TossPriceLimits = {
  symbol: string;
  timestamp: string | null;
  upperLimitPrice: number | null;
  lowerLimitPrice: number | null;
  currency: TossCurrency | null;
  raw: unknown;
};

/** GET /api/v1/stocks */
export type TossStockInfo = {
  symbol: string;
  name: string;
  englishName: string;
  isinCode: string;
  /** e.g. NASDAQ, NYSE, AMEX, KOSPI, KOSDAQ */
  market: string;
  securityType: string;
  isCommonShare: boolean;
  status: TossStockStatus;
  currency: TossCurrency;
  listDate: string | null;
  delistDate: string | null;
  sharesOutstanding: string;
  leverageFactor: string | null;
  koreanMarketDetail: TossKoreanMarketDetail | null;
  raw: unknown;
};

/** GET /api/v1/stocks/{symbol}/warnings */
export type TossStockWarning = {
  symbol: string;
  warningType: TossWarningType;
  exchange: string | null;
  startDate: string | null;
  endDate: string | null;
  active: boolean;
  raw: unknown;
};

/** GET /api/v1/exchange-rate */
export type TossExchangeRate = {
  baseCurrency: TossCurrency;
  quoteCurrency: TossCurrency;
  rate: number | null;
  midRate: number | null;
  basisPoint: string | null;
  rateChangeType: string | null;
  validFrom: string | null;
  validUntil: string | null;
  raw: unknown;
};

/** GET /api/v1/market-calendar/{country} */
export type TossUsSession = {
  startTime: string | null;
  endTime: string | null;
};

export type TossUsMarketDay = {
  date: string;
  dayMarket: TossUsSession | null;
  preMarket: TossUsSession | null;
  regularMarket: TossUsSession | null;
  afterMarket: TossUsSession | null;
};

export type TossKrIntegratedSession = {
  startTime: string | null;
  singlePriceAuctionStartTime?: string | null;
  singlePriceAuctionEndTime?: string | null;
  endTime: string | null;
};

export type TossKrMarketDay = {
  date: string;
  integrated: {
    preMarket: TossKrIntegratedSession | null;
    regularMarket: TossKrIntegratedSession | null;
    afterMarket: TossKrIntegratedSession | null;
  } | null;
};

export type TossUsMarketCalendar = {
  country: "US";
  today: TossUsMarketDay;
  previousBusinessDay: TossUsMarketDay | null;
  nextBusinessDay: TossUsMarketDay | null;
  raw: unknown;
};

export type TossKrMarketCalendar = {
  country: "KR";
  today: TossKrMarketDay;
  previousBusinessDay: TossKrMarketDay | null;
  nextBusinessDay: TossKrMarketDay | null;
  raw: unknown;
};

export type TossMarketCalendar = TossUsMarketCalendar | TossKrMarketCalendar;

/** GET /api/v1/rankings */
export type TossRankingRow = {
  rank: number;
  symbol: string;
  currency: TossCurrency;
  lastPrice: number | null;
  basePrice: number | null;
  changeRate: number | null;
  tradingVolume: number | null;
  tradingAmount: number | null;
  raw: unknown;
};

export type TossRankingsPage = {
  marketCountry: TossMarketCountry;
  type: string;
  duration: string;
  rankedAt: string | null;
  rankings: TossRankingRow[];
  raw: unknown;
};

/** Market indicators */
export type TossIndicatorPrice = {
  symbol: string;
  timestamp: string | null;
  lastPrice: number | null;
  currency: TossCurrency | null;
  raw: unknown;
};

export type TossIndicatorCandlePage = {
  symbol: string;
  interval: TossCandleInterval;
  candles: TossCandleNormalized[];
  nextBefore: string | null;
  raw: unknown;
};

/** Aggregated US snapshot for one or many symbols */
export type TossUsSymbolSnapshot = {
  symbol: string;
  stock: TossStockInfo | null;
  price: TossPriceNormalized | null;
  orderbook: TossOrderbook | null;
  trades: TossTrade[];
  priceLimits: TossPriceLimits | null;
  warnings: TossStockWarning[];
  errors: Record<string, string>;
};

export type TossUsMarketBundle = {
  fetchedAt: string;
  calendar: TossUsMarketCalendar | null;
  exchangeRateUsdKrw: TossExchangeRate | null;
  rankings: {
    topGainers: TossRankingsPage | null;
    topLosers: TossRankingsPage | null;
    volume: TossRankingsPage | null;
  };
  snapshots: TossUsSymbolSnapshot[];
  notes: string[];
};

/** Known market-indicator symbols (Toss catalog) */
export const TOSS_MARKET_INDICATOR_SYMBOLS = [
  "KOSPI",
  "KOSDAQ",
  "KR_BOND_1Y",
  "KR_BOND_3Y",
  "KR_BOND_5Y",
  "KR_BOND_10Y",
  "KR_BOND_20Y",
  "KR_BOND_30Y",
] as const;

export type TossMarketIndicatorSymbol = (typeof TOSS_MARKET_INDICATOR_SYMBOLS)[number];
