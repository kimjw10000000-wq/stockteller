import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TogetherApiError, isTogetherConfigured, togetherModel } from "@/lib/together/client";
import { classifyDilutionArticle } from "@/lib/together/dilution";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

type Body = {
  title?: string;
  body?: string;
};

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  if (!isTogetherConfigured()) {
    return NextResponse.json(
      { ok: false, error: "TOGETHER_API_KEY가 설정되지 않았습니다." },
      { status: 503 }
    );
  }

  let payload: Body;
  try {
    payload = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }

  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  if (!body) {
    return NextResponse.json({ ok: false, error: "원문을 붙여넣으세요." }, { status: 400 });
  }
  if (body.length > 40_000) {
    return NextResponse.json({ ok: false, error: "원문이 너무 깁니다. 4만 자 이하로 넣어 주세요." }, { status: 400 });
  }

  try {
    const result = await classifyDilutionArticle({
      title: title || "Untitled",
      body,
    });
    return NextResponse.json({ ok: true, model: togetherModel(), result });
  } catch (err) {
    const message =
      err instanceof TogetherApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : "요약에 실패했습니다.";
    const status = err instanceof TogetherApiError ? err.httpStatus : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
