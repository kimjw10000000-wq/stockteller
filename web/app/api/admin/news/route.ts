import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { previewSummaryFromBody } from "@/lib/manual-post";

type Body = {
  title?: string;
  body?: string;
  adminSecret?: string;
};

function timingSafeEqualString(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const expected = process.env.ADMIN_NEWS_SECRET?.trim();
  if (!expected || expected.length < 12) {
    console.error("[admin/news] ADMIN_NEWS_SECRET missing or too short");
    return NextResponse.json(
      { ok: false, error: "서버에 관리자 설정이 되어 있지 않습니다." },
      { status: 503 }
    );
  }

  let payload: Body;
  try {
    payload = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  const authHeader = req.headers.get("authorization");
  const bearer =
    authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const secret =
    typeof payload.adminSecret === "string" && payload.adminSecret.trim()
      ? payload.adminSecret.trim()
      : bearer;

  if (!secret || !timingSafeEqualString(secret, expected)) {
    return NextResponse.json({ ok: false, error: "권한이 없습니다." }, { status: 401 });
  }

  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  if (!title) {
    return NextResponse.json({ ok: false, error: "제목을 입력해 주세요." }, { status: 400 });
  }
  if (!body) {
    return NextResponse.json({ ok: false, error: "본문을 입력해 주세요." }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const externalId = `manual:${crypto.randomUUID()}`;
    const summary = previewSummaryFromBody(body);

    const { data, error } = await admin
      .from("disclosures")
      .insert({
        stock_id: null,
        external_id: externalId,
        title,
        raw_content: body,
        summary,
        sentiment: null,
        analysis_score: null,
        gemini_metadata: { source: "manual_editor" },
      })
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[admin/news] insert", error.message);
      return NextResponse.json({ ok: false, error: "저장에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: data?.id ?? null });
  } catch (e) {
    const message = e instanceof Error ? e.message : "DB 오류";
    console.error("[admin/news]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
