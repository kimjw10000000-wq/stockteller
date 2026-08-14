import { NextResponse } from "next/server";
import {
  loadRegisteredCapacitySnapshot,
  refreshRegisteredCapacityForTicker,
} from "@/lib/companies/registered-capacity";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const ticker = new URL(req.url).searchParams.get("ticker")?.trim() ?? "";
  if (!ticker) {
    return NextResponse.json({ ok: false, error: "ticker 쿼리가 필요합니다." }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const snap = await loadRegisteredCapacitySnapshot(admin, ticker);
    if (!snap) {
      return NextResponse.json({ ok: false, error: "상장사 목록에 없는 티커입니다." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, ...snap });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { ticker?: string };
  const ticker = body.ticker?.trim() ?? "";
  if (!ticker) {
    return NextResponse.json({ ok: false, error: "ticker 이 필요합니다." }, { status: 400 });
  }
  try {
    const admin = createAdminClient();
    const scan = await refreshRegisteredCapacityForTicker(admin, ticker);
    return NextResponse.json({
      ok: true,
      ticker: scan.ticker,
      issuerType: scan.issuerType,
      isUnlimitedShelf: scan.isUnlimitedShelf,
      totalRegisteredOfferingCapacity: scan.totalRegisteredOfferingCapacity,
      filings: scan.filings,
      effectsScanned: scan.effectsScanned,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
