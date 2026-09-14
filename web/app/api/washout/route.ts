import { NextResponse } from "next/server";
import { getWashoutBoard, type WashoutRange } from "@/lib/us-market/washout-live";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function parseRange(raw: string | null): WashoutRange {
  if (raw === "1d" || raw === "1w" || raw === "1m" || raw === "3m") return raw;
  return "1d";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  const range = parseRange(url.searchParams.get("range"));
  try {
    const result = await getWashoutBoard({ force, range });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "server error";
    try {
      const fallback = await getWashoutBoard({ force: false, range: range === "1d" ? "3m" : range });
      if (fallback.series.length > 0) {
        return NextResponse.json(
          { ...fallback, range, error: undefined },
          { headers: { "Cache-Control": "no-store" } }
        );
      }
    } catch {
      /* 아래 에러 응답 */
    }
    const missing = message.includes("POLYGON_API_KEY_ADVANCED");
    return NextResponse.json(
      {
        index: 0,
        series: [],
        items: [],
        range,
        axisStart: 0,
        axisEnd: 0,
        sessionDate: "",
        fetchedAt: new Date().toISOString(),
        servedFromCache: false,
        error: missing ? "advanced_key_missing" : message,
      },
      { status: missing ? 503 : 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
