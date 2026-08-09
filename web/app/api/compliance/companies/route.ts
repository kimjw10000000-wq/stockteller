import { NextResponse } from "next/server";
import { searchUsListedCompanies } from "@/lib/companies/search";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const limitRaw = Number(url.searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitRaw) ? limitRaw : 20;

  if (!q) {
    return NextResponse.json({ items: [], q, count: 0 });
  }

  try {
    const admin = createAdminClient();
    const items = await searchUsListedCompanies(admin, q, limit);
    return NextResponse.json(
      {
        items: items.map((r) => ({
          ticker: r.ticker,
          name: r.name,
          marketCap: r.market_cap,
          cik: r.cik,
          exchange: r.exchange,
        })),
        q,
        count: items.length,
      },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Table missing until migration applied
    console.error("[compliance/companies]", message);
    return NextResponse.json(
      { items: [], q, count: 0, error: message },
      { status: message.includes("does not exist") || message.includes("42P01") ? 503 : 500 }
    );
  }
}
