import { NextResponse } from "next/server";
import { listDisclosuresPaginated } from "@/lib/disclosures";
import { parseMarketKey, parseSortKey } from "@/lib/news-sort";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sort = parseSortKey(searchParams.get("sort") ?? undefined);
  const market = parseMarketKey(searchParams.get("market") ?? undefined);
  const q = searchParams.get("q")?.trim() ?? "";
  const cursor = searchParams.get("cursor")?.trim() ?? undefined;
  const excludeId = searchParams.get("excludeId")?.trim() ?? undefined;
  const limitRaw = Number(searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 40) : 20;

  try {
    const { items, nextCursor } = await listDisclosuresPaginated({
      sort,
      market,
      q: q || undefined,
      cursor,
      excludeId,
      limit,
    });
    return NextResponse.json({ ok: true, items, nextCursor });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
