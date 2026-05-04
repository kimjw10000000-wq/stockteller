import { NextResponse } from "next/server";
import { getDisclosureById } from "@/lib/disclosures";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

export async function GET(_req: Request, context: RouteContext) {
  const { id } = context.params;
  try {
    const item = await getDisclosureById(id);
    if (!item) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
