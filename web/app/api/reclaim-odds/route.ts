import { NextResponse } from "next/server";
import { sharedCdnCache } from "@/lib/http/shared-cdn-cache";
import { loadPublishedReclaimOdds } from "@/lib/us-market/washout-published";

export const revalidate = 1;
export const runtime = "nodejs";

export async function GET() {
  const file = await loadPublishedReclaimOdds();
  if (!file) {
    return NextResponse.json({ cards: [] }, { headers: sharedCdnCache(1, 2) });
  }
  return NextResponse.json(file, { headers: sharedCdnCache(1, 2) });
}
