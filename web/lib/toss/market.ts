/**
 * Legacy entry — re-exports market-data helpers for existing imports.
 * Prefer `@/lib/toss/market-data` or `@/lib/toss` going forward.
 */
export {
  fetchTossCandles,
  fetchTossCandlesPage,
  fetchTossOrderbook,
  fetchTossPriceLimits,
  fetchTossPrices,
  fetchTossTrades,
  normalizeTossPrice,
  type TossCandle,
  type TossPrice,
} from "./market-data";
