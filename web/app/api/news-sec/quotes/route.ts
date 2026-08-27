import { NextResponse } from "next/server";
import { loadTickerQuotes } from "@/lib/quotes/ticker-quotes";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const tickers = (new URL(req.url).searchParams.get("tickers") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 200);
  const quotes = await loadTickerQuotes(tickers);
  return NextResponse.json(
    { quotes, count: Object.keys(quotes).length },
    { headers: { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=15" } }
  );
}
