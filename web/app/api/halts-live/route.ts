import { NextResponse } from "next/server";
import { sharedCdnCache } from "@/lib/http/shared-cdn-cache";
import { loadPublishedHaltLive } from "@/lib/us-market/washout-published";

export const revalidate = 1;
export const runtime = "nodejs";

export async function GET() {
  const file = await loadPublishedHaltLive();
  if (!file) {
    return NextResponse.json({ cards: [] }, { headers: sharedCdnCache(1, 2) });
  }
  return NextResponse.json(file, { headers: sharedCdnCache(1, 2) });
}
