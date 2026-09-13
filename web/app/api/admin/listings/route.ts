import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  diffListings,
  listingIpoInsert,
  listingRename,
  loadListingSnapshot,
  otcRemainingListB,
  saveListingSnapshot,
  scanListingUpdate,
} from "@/lib/companies/listing-admin";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    return { ok: false as const, res: NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 }) };
  }
  return { ok: true as const, admin: createAdminClient() };
}

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;
  try {
    const snap = await loadListingSnapshot(gate.admin);
    if (!snap) {
      return NextResponse.json({
        ok: true,
        traderCount: 0,
        matched: 0,
        listA: [],
        listB: [],
        listBPick: [],
        aliases: [],
        prunedAliases: [],
        inheritedJuniors: 0,
        pairedJuniors: [],
        moreWork: false,
        error: "아직 저장된 목록이 없습니다. Cursor에서 목록 업데이트를 한 번 돌려 주세요.",
      });
    }
    return NextResponse.json({ ok: true, ...snap });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;
  let body: { action?: string; ticker?: string; from?: string; to?: string };
  try {
    body = (await req.json()) as { action?: string; ticker?: string; from?: string; to?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }
  const action = body.action ?? "scan";
  try {
    if (action === "scan") {
      const result = await scanListingUpdate(gate.admin);
      return NextResponse.json({ ok: true, ...result });
    }
    if (action === "ipo") {
      const ticker = String(body.ticker ?? "");
      const inserted = await listingIpoInsert(gate.admin, ticker);
      const snap = await loadListingSnapshot(gate.admin);
      if (snap) {
        snap.listA = snap.listA.filter((r) => r.ticker !== inserted.ticker);
        snap.pairedJuniors = snap.pairedJuniors.filter((r) => r.parentTicker !== inserted.ticker && r.ticker !== inserted.ticker);
        await saveListingSnapshot(gate.admin, snap);
        return NextResponse.json({ ok: true, inserted, ...snap });
      }
      return NextResponse.json({ ok: true, inserted, ...(await diffListings(gate.admin)) });
    }
    if (action === "rename") {
      const from = String(body.from ?? "");
      const to = String(body.to ?? "");
      await listingRename(gate.admin, from, to);
      const snap = await loadListingSnapshot(gate.admin);
      if (snap) {
        snap.listA = snap.listA.filter((r) => r.ticker !== to);
        snap.listB = snap.listB.filter((r) => r.ticker !== from);
        snap.listBPick = (snap.listBPick ?? []).filter((r) => r.ticker !== from);
        snap.aliases = [...snap.aliases.filter((a) => a.oldTicker !== from), { oldTicker: from, newTicker: to }];
        await saveListingSnapshot(gate.admin, snap);
        return NextResponse.json({ ok: true, ...snap });
      }
      return NextResponse.json({ ok: true, ...(await diffListings(gate.admin)) });
    }
    if (action === "otc-remaining") {
      const deactivated = await otcRemainingListB(gate.admin);
      const snap = await loadListingSnapshot(gate.admin);
      if (snap) {
        snap.listB = [];
        await saveListingSnapshot(gate.admin, snap);
        return NextResponse.json({ ok: true, deactivated, ...snap });
      }
      return NextResponse.json({ ok: true, deactivated, ...(await diffListings(gate.admin)) });
    }
    return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
