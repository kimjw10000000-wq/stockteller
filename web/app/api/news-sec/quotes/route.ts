import { NextResponse } from "next/server";
import { loadAllTickerQuotes } from "@/lib/quotes/ticker-quotes";

export const revalidate = 1;
export const runtime = "nodejs";

const CACHE =
  "public, max-age=1, s-maxage=1, stale-while-revalidate=2";

export async function GET() {
  const quotes = await loadAllTickerQuotes();
  return NextResponse.json(
    { quotes, count: Object.keys(quotes).length },
    {
      headers: {
        "Cache-Control": CACHE,
        "CDN-Cache-Control": CACHE,
        "Vercel-CDN-Cache-Control": CACHE,
      },
    }
  );
}
