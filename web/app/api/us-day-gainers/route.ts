import { NextResponse } from "next/server";
import { isAlphaVantageConfigured } from "@/lib/us-market/alpha-vantage-gainers";
import { getUsMarketGainersForRoute } from "@/lib/us-market/us-gainers-server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const minRaw = new URL(req.url).searchParams.get("minPct");
  const parsed = minRaw != null ? Number(minRaw) : 20;
  const minPct = Number.isFinite(parsed) ? parsed : 20;

  try {
    const result = await getUsMarketGainersForRoute(minPct);

    return NextResponse.json({
      items: result.items,
      source: result.source,
      alphavantageConfigured: isAlphaVantageConfigured(),
      delayedMarketSnapshot: result.delayedMarketSnapshot,
      finnhubQuoteRefined: result.finnhubQuoteRefined,
      fetchedAt: new Date().toISOString(),
      minPct,
    });
  } catch (e) {
    console.error("[us-day-gainers]", e);
    return NextResponse.json(
      {
        items: [] as const,
        source: "empty" as const,
        alphavantageConfigured: isAlphaVantageConfigured(),
        delayedMarketSnapshot: false,
        finnhubQuoteRefined: false,
        error: e instanceof Error ? e.message : "server error",
        fetchedAt: new Date().toISOString(),
        minPct,
      },
      { status: 500 }
    );
  }
}
