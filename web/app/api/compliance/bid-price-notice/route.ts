import { NextResponse } from "next/server";
import { getComplianceSeedTicker } from "@/lib/compliance-seed-tickers";
import { scanBidPriceDeficiencyNotice } from "@/lib/sec/bid-price-deficiency-scan";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

async function ensureSeedStockInDb(ticker: string) {
  const seed = getComplianceSeedTicker(ticker);
  if (!seed) return;
  try {
    const admin = createAdminClient();
    await admin.from("stocks").upsert(
      { name: seed.companyName, ticker: seed.ticker, market: "us" },
      { onConflict: "ticker" }
    );
  } catch (e) {
    console.warn("[compliance/bid-price-notice] seed upsert skipped", e);
  }
}

export async function GET(req: Request) {
  const ticker = new URL(req.url).searchParams.get("ticker")?.trim() ?? "";
  if (!ticker) {
    return NextResponse.json({ ok: false, error: "ticker 쿼리가 필요합니다." }, { status: 400 });
  }

  try {
    void ensureSeedStockInDb(ticker);
    const result = await scanBidPriceDeficiencyNotice(ticker);
    if (!result.ok) {
      return NextResponse.json(result, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[compliance/bid-price-notice]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
