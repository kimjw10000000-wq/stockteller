import { NextResponse } from "next/server";
import { loadPublishedWashout, publishWashoutCatalog } from "@/lib/us-market/washout-published";
import { loadWashoutMembers } from "@/lib/us-market/washout-samples";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const SHARED = {
  "Cache-Control": "public, max-age=0, s-maxage=15, stale-while-revalidate=0",
  "CDN-Cache-Control": "public, s-maxage=15",
  "Vercel-CDN-Cache-Control": "public, s-maxage=15",
};

/** 매분 그려 둔 점수표를 그대로 준다. 이 요청에서는 표를 다시 만들지 않는다. */
export async function GET() {
  try {
    const published = await loadPublishedWashout();
    if (published) {
      const members = published.members ?? (await loadWashoutMembers());
      return NextResponse.json(
        { boards: published.boards, builtAt: published.builtAt, members },
        { headers: SHARED }
      );
    }
    const made = await publishWashoutCatalog();
    return NextResponse.json(
      { boards: made.boards, builtAt: made.builtAt, members: made.members },
      { headers: SHARED }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "server error";
    return NextResponse.json(
      { boards: {}, error: message },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
