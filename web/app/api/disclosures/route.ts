import { NextResponse } from "next/server";
import { listDisclosures } from "@/lib/disclosures";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const items = await listDisclosures(40);
    return NextResponse.json({ ok: true, items });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
