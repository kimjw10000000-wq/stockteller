import { NextResponse } from "next/server";
import { fetchNasdaqTradeHalts } from "@/lib/halts/nasdaq-trade-halts";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await fetchNasdaqTradeHalts();
    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
      },
    });
  } catch (e) {
    console.error("[halts]", e);
    return NextResponse.json(
      {
        items: [],
        count: 0,
        source: "nasdaq-rss" as const,
        fetchedAt: new Date().toISOString(),
        error: e instanceof Error ? e.message : "server error",
      },
      { status: 502 }
    );
  }
}
