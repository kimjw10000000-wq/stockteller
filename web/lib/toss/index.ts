/**
 * Toss Invest Open API — modular client
 *
 * Market data (read-only):
 * - prices, orderbook, trades, candles, price-limits
 * - stocks, warnings
 * - exchange-rate, market-calendar
 * - rankings
 * - market-indicators
 * - US aggregators (us-market)
 */

export { isTossConfigured, TossApiError, tossFetch, tossSafe, requireTossConfigured } from "./client";
export * from "./types";
export {
  unwrapResult,
  asArray,
  num,
  parsePrice,
  parseOrderbook,
  parseTrade,
  parseCandle,
  parseCandlePage,
  parsePriceLimits,
  parseStockInfo,
  parseStockWarning,
  parseExchangeRate,
  parseMarketCalendar,
  parseRankingsPage,
} from "./parse";
export {
  fetchTossPrices,
  fetchTossOrderbook,
  fetchTossTrades,
  fetchTossCandles,
  fetchTossCandlesPage,
  fetchTossPriceLimits,
} from "./market-data";
export {
  fetchTossStocks,
  fetchTossStockMap,
  fetchTossStockWarnings,
  fetchTossMarketCalendar,
  fetchTossWarningsForSymbols,
} from "./stocks";
export { fetchTossExchangeRate } from "./market-info";
export { fetchTossRankings, fetchUsRankingsBundle } from "./rankings";
export {
  fetchTossIndicatorPrices,
  fetchTossIndicatorCandles,
  fetchTossInvestorTrading,
  TOSS_MARKET_INDICATOR_SYMBOLS,
} from "./indicators";
export {
  fetchUsSymbolUniverseCandidates,
  fetchUsSymbolSnapshot,
  fetchUsMarketBundle,
  fetchUsCandles,
} from "./us-market";
