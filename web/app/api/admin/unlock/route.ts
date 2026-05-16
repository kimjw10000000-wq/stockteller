import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { adminGateCookieValue } from "@/lib/admin-gate";

type Body = { secret?: string; next?: string };

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

function safeNextPath(raw: string | undefined): string {
  if (!raw || !raw.startsWith("/admin") || raw.startsWith("//")) return "/admin/news";
  return raw;
}

export async function POST(req: Request) {
  const expected = process.env.ADMIN_NEWS_SECRET?.trim();
  if (!expected || expected.length < 12) {
    return NextResponse.json({ ok: false, error: "서버에 ADMIN_NEWS_SECRET 이 설정되어 있지 않습니다." }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }

  const submitted = typeof body.secret === "string" ? body.secret.trim() : "";
  if (!submitted || !timingSafeEqualString(submitted, expected)) {
    return NextResponse.json({ ok: false, error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  const nextPath = safeNextPath(typeof body.next === "string" ? body.next : undefined);
  const token = await adminGateCookieValue(expected);

  const res = NextResponse.json({ ok: true, next: nextPath });
  res.cookies.set("whyup_admin_gate", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
