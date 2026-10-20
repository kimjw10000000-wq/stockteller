import { NextResponse } from "next/server";
import { sharedCdnCache } from "@/lib/http/shared-cdn-cache";
import { loadPublishedKoreanNamesFile } from "@/lib/us-market/washout-published";

export const revalidate = 60;
export const runtime = "nodejs";

export async function GET() {
  const file = await loadPublishedKoreanNamesFile();
  if (!file) {
    return NextResponse.json({ names: {} }, { headers: sharedCdnCache(60, 60) });
  }
  return NextResponse.json(file, { headers: sharedCdnCache(60, 60) });
}
