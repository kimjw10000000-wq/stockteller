import { requireTossConfigured, tossFetch } from "./client";
import { parseExchangeRate, parseMarketCalendar } from "./parse";
import type { TossExchangeRate, TossMarketCalendar, TossMarketCountry } from "./types";

/** GET /api/v1/exchange-rate */
export async function fetchTossExchangeRate(options?: {
  baseCurrency?: string;
  quoteCurrency?: string;
  dateTime?: string;
}): Promise<TossExchangeRate> {
  requireTossConfigured();
  const data = await tossFetch<unknown>("/api/v1/exchange-rate", {
    searchParams: {
      baseCurrency: options?.baseCurrency ?? "USD",
      quoteCurrency: options?.quoteCurrency ?? "KRW",
      dateTime: options?.dateTime,
    },
  });
  return parseExchangeRate(data);
}

/** Alias kept for calendar imports that used stocks.ts */
export async function fetchTossMarketInfoCalendar(
  country: TossMarketCountry,
  date?: string
): Promise<TossMarketCalendar> {
  requireTossConfigured();
  const data = await tossFetch<unknown>(`/api/v1/market-calendar/${country}`, {
    searchParams: date ? { date } : undefined,
  });
  return parseMarketCalendar(country, data);
}
