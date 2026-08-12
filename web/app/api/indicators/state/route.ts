import { NextResponse } from "next/server";
import { getSnapshot } from "@/lib/indicators/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ ok: true, ...getSnapshot() });
}
