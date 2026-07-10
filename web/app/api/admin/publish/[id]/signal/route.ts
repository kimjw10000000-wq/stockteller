import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin-auth";
import { getAdminDisclosureById, updateAdminDisclosureSignal } from "@/lib/admin-publish-service";
import { isManualEditorPost } from "@/lib/manual-post";
import { isSignalStatus } from "@/lib/signal-status";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteContext = { params: { id: string } };

export async function PATCH(req: Request, { params }: RouteContext) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const existing = await getAdminDisclosureById(params.id);
  if (!existing || !isManualEditorPost(existing)) {
    return NextResponse.json({ ok: false, error: "시그널을 변경할 수 있는 기사를 찾을 수 없습니다." }, { status: 404 });
  }

  let body: { signal_status?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }

  if (!isSignalStatus(body.signal_status)) {
    return NextResponse.json(
      { ok: false, error: "signal_status는 positive, caution, danger 중 하나여야 합니다." },
      { status: 400 }
    );
  }

  try {
    const data = await updateAdminDisclosureSignal(params.id, body.signal_status);
    return NextResponse.json({ ok: true, id: data.id, signal_status: data.signal_status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "서버 오류";
    if (msg === "NOT_FOUND") {
      return NextResponse.json({ ok: false, error: "기사를 찾을 수 없습니다." }, { status: 404 });
    }
    console.error("[admin/publish/signal]", msg);
    return NextResponse.json({ ok: false, error: "시그널 저장에 실패했습니다." }, { status: 500 });
  }
}
