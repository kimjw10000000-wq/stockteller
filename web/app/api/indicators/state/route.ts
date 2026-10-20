import { NextResponse } from "next/server";
import { sharedCdnCache } from "@/lib/http/shared-cdn-cache";
import { hydrateLatestActuals } from "@/lib/indicators/hydrate";
import { getSnapshot } from "@/lib/indicators/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  await hydrateLatestActuals();
  return NextResponse.json({ ok: true, ...getSnapshot() }, { headers: sharedCdnCache(1, 2) });
}
