import { NextResponse } from "next/server";
import { isTossConfigured } from "@/lib/toss/client";
import { TOSS_MARKET_INDICATOR_SYMBOLS } from "@/lib/toss/indicators";

export const dynamic = "force-dynamic";

/** Catalog of wired Toss read endpoints (for agents / internal tooling). */
export async function GET() {
  return NextResponse.json({
    ok: true,
    configured: isTossConfigured(),
    baseUrl: process.env.TOSSINVEST_API_BASE_URL?.trim() || "https://openapi.tossinvest.com",
    envVars: ["TOSSINVEST_CLIENT_ID", "TOSSINVEST_CLIENT_SECRET", "TOSSINVEST_API_BASE_URL"],
    limitations: [
      "미국 전 종목 마스터 dump API 없음 → /api/toss/us?mode=universe (랭킹 후보) + us_listed_companies",
      "미국 Halt/Resume 전체 피드 없음 → /api/halts (NASDAQ RSS) + /api/toss/warnings?symbol=",
      "VI/유의는 종목별 조회만 가능",
    ],
    endpoints: [
      { method: "GET", path: "/api/toss/prices", upstream: "GET /api/v1/prices", query: "symbols" },
      { method: "GET", path: "/api/toss/orderbook", upstream: "GET /api/v1/orderbook", query: "symbol" },
      { method: "GET", path: "/api/toss/trades", upstream: "GET /api/v1/trades", query: "symbol,count" },
      {
        method: "GET",
        path: "/api/toss/candles",
        upstream: "GET /api/v1/candles",
        query: "symbol,interval,count,before,adjusted",
      },
      {
        method: "GET",
        path: "/api/toss/price-limits",
        upstream: "GET /api/v1/price-limits",
        query: "symbol",
      },
      { method: "GET", path: "/api/toss/stocks", upstream: "GET /api/v1/stocks", query: "symbols" },
      {
        method: "GET",
        path: "/api/toss/warnings",
        upstream: "GET /api/v1/stocks/{symbol}/warnings",
        query: "symbol",
      },
      {
        method: "GET",
        path: "/api/toss/exchange-rate",
        upstream: "GET /api/v1/exchange-rate",
        query: "base,quote,dateTime",
      },
      {
        method: "GET",
        path: "/api/toss/market-calendar",
        upstream: "GET /api/v1/market-calendar/{country}",
        query: "country,date",
      },
      {
        method: "GET",
        path: "/api/toss/rankings",
        upstream: "GET /api/v1/rankings",
        query: "type,marketCountry,duration,count",
      },
      {
        method: "GET",
        path: "/api/toss/indicators/prices",
        upstream: "GET /api/v1/market-indicators/prices",
        query: "symbols",
      },
      {
        method: "GET",
        path: "/api/toss/indicators/candles",
        upstream: "GET /api/v1/market-indicators/{symbol}/candles",
        query: "symbol,interval,count,before",
      },
      {
        method: "GET",
        path: "/api/toss/us",
        upstream: "aggregate US helpers",
        query: "mode=bundle|snapshot|universe,symbols,orderbook,trades",
      },
    ],
    indicatorCatalog: TOSS_MARKET_INDICATOR_SYMBOLS,
    libEntry: "@/lib/toss",
  });
}
