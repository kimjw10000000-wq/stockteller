import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  diffListings,
  listingIpoInsert,
  listingRename,
  otcRemainingListB,
  scanListingUpdate,
} from "@/lib/companies/listing-admin";

export const runtime = "nodejs";
export const maxDuration = 120;
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
    const diff = await diffListings(gate.admin);
    return NextResponse.json({ ok: true, ...diff, matched: 0, prunedAliases: [], inheritedJuniors: 0 });
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
      const diff = await diffListings(gate.admin);
      return NextResponse.json({ ok: true, inserted, ...diff });
    }
    if (action === "rename") {
      await listingRename(gate.admin, String(body.from ?? ""), String(body.to ?? ""));
      const diff = await diffListings(gate.admin);
      return NextResponse.json({ ok: true, ...diff });
    }
    if (action === "otc-remaining") {
      const deactivated = await otcRemainingListB(gate.admin);
      const diff = await diffListings(gate.admin);
      return NextResponse.json({ ok: true, deactivated, ...diff });
    }
    return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
