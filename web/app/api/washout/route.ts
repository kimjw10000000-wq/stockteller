import { NextResponse } from "next/server";
import { getWashoutCatalog } from "@/lib/us-market/washout-live";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const SHARED = {
  "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=120",
  "CDN-Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
  "Vercel-CDN-Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
};

/** 점수표 한 장을 올려 두고 모든 방문자가 같은 응답을 받는다. Polygon은 호출하지 않는다. */
export async function GET() {
  try {
    const boards = await getWashoutCatalog();
    return NextResponse.json({ boards }, { headers: SHARED });
  } catch (e) {
    const message = e instanceof Error ? e.message : "server error";
    return NextResponse.json(
      { boards: {}, error: message },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
