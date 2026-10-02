import { NextResponse } from "next/server";
import { getWashoutBoard, type WashoutRange } from "@/lib/us-market/washout-live";
import type { UsTradingSession } from "@/lib/us-market/us-session";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const runtime = "nodejs";
export const maxDuration = 60;

function parseRange(raw: string | null): WashoutRange {
  if (raw === "1d" || raw === "1w" || raw === "1m" || raw === "3m") return raw;
  return "1d";
}

function parseSession(raw: string | null): UsTradingSession | undefined {
  if (raw === "premarket" || raw === "regular" || raw === "afterhours") return raw;
  return undefined;
}

/** Vercel은 Polygon을 호출하지 않고 Supabase 샘플만 읽는다. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  const range = parseRange(url.searchParams.get("range"));
  const session = parseSession(url.searchParams.get("session"));
  try {
    const result = await getWashoutBoard({ force, range, session });
    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0",
        "CDN-Cache-Control": "no-store",
        "Vercel-CDN-Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "server error";
    return NextResponse.json(
      {
        index: 0,
        series: [],
        items: [],
        range,
        session: session ?? "regular",
        axisStart: 0,
        axisEnd: 0,
        sessionDate: "",
        fetchedAt: new Date().toISOString(),
        servedFromCache: false,
        compare: {
          session: null,
          yesterday: null,
          avg5: null,
          avg20: null,
          days5: 0,
          days20: 0,
          paths: { yesterday: [], avg5: [], avg20: [] },
        },
        error: message,
      },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
