import { NextResponse } from "next/server";
import { hydrateLatestActuals } from "@/lib/indicators/hydrate";
import { getSnapshot } from "@/lib/indicators/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  await hydrateLatestActuals();
  return NextResponse.json({ ok: true, ...getSnapshot() });
}
