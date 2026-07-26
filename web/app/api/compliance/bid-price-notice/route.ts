import { NextResponse } from "next/server";
import { scanBidPriceDeficiencyNotice } from "@/lib/sec/bid-price-deficiency-scan";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const ticker = new URL(req.url).searchParams.get("ticker")?.trim() ?? "";
  if (!ticker) {
    return NextResponse.json({ ok: false, error: "ticker 쿼리가 필요합니다." }, { status: 400 });
  }

  try {
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
