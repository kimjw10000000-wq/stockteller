import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  listingIpoInsert,
  listingRename,
  loadListingSnapshot,
  otcRemainingListB,
  saveListingSnapshot,
  type ListingSnapshotPayload,
} from "@/lib/companies/listing-admin";

export const runtime = "nodejs";
export const maxDuration = 30;
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

function listsJson(snap: ListingSnapshotPayload | null, extra?: Record<string, unknown>) {
  return NextResponse.json({
    ok: true,
    listA: visibleListA(snap?.listA ?? []),
    listB: snap?.listB ?? [],
    ...extra,
  });
}

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;
  try {
    const snap = await loadListingSnapshot(gate.admin);
    if (!snap) {
      return listsJson(null, {
        error: "아직 저장된 목록이 없습니다. Cursor에서 목록 업데이트를 한 번 돌려 주세요.",
      });
    }
    return listsJson(snap);
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
  const action = body.action ?? "";
  try {
    if (action === "ipo") {
      const ticker = String(body.ticker ?? "");
      const inserted = await listingIpoInsert(gate.admin, ticker);
      const snap = await loadListingSnapshot(gate.admin);
      if (!snap) {
        return NextResponse.json({ ok: true, inserted, listA: [], listB: [] });
      }
      snap.listA = snap.listA.filter((r) => r.ticker !== inserted.ticker);
      snap.pairedJuniors = snap.pairedJuniors.filter(
        (r) => r.parentTicker !== inserted.ticker && r.ticker !== inserted.ticker
      );
      await saveListingSnapshot(gate.admin, snap);
      return listsJson(snap, { inserted });
    }
    if (action === "rename") {
      const from = String(body.from ?? "");
      const to = String(body.to ?? "");
      await listingRename(gate.admin, from, to);
      const snap = await loadListingSnapshot(gate.admin);
      if (!snap) {
        return NextResponse.json({ ok: true, listA: [], listB: [] });
      }
      snap.listA = snap.listA.filter((r) => r.ticker !== to);
      snap.listB = snap.listB.filter((r) => r.ticker !== from);
      snap.listBPick = (snap.listBPick ?? []).filter((r) => r.ticker !== from);
      snap.aliases = [...snap.aliases.filter((a) => a.oldTicker !== from), { oldTicker: from, newTicker: to }];
      await saveListingSnapshot(gate.admin, snap);
      return listsJson(snap);
    }
    if (action === "otc-remaining") {
      const deactivated = await otcRemainingListB(gate.admin);
      const snap = await loadListingSnapshot(gate.admin);
      if (!snap) {
        return NextResponse.json({ ok: true, deactivated, listA: [], listB: [] });
      }
      snap.listB = [];
      await saveListingSnapshot(gate.admin, snap);
      return listsJson(snap, { deactivated });
    }
    return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
