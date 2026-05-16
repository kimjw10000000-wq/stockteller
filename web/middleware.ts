import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { adminGateCookieValue, timingSafeEqualHex } from "@/lib/admin-gate";

export async function middleware(request: NextRequest) {
  const secret = process.env.ADMIN_NEWS_SECRET?.trim();
  const accessSlug = process.env.ADMIN_ACCESS_SLUG?.trim();
  const gateEnabled = Boolean(
    secret && secret.length >= 12 && accessSlug && accessSlug.length >= 8
  );

  if (!gateEnabled) {
    if (secret && secret.length >= 12 && (!accessSlug || accessSlug.length < 8)) {
      console.warn(
        "[middleware] ADMIN_ACCESS_SLUG(8자 이상)를 설정해야 /admin 잠금이 켜집니다. 지금은 /admin 이 공개 동작합니다."
      );
    }
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  /* 예전 공개 주소 — 방문자에게 비밀번호 칸을 보이지 않고 뉴스 피드로만 보냄 */
  if (pathname === "/admin/unlock") {
    return NextResponse.redirect(new URL("/feed", request.url));
  }

  /* 관리자만 아는 경로: 실제 비밀번호 폼은 여기서만 페이지로 렌더됨 */
  if (pathname.startsWith("/admin/access/")) {
    return NextResponse.next();
  }

  const cookieVal = request.cookies.get("whyup_admin_gate")?.value ?? "";
  const expected = await adminGateCookieValue(secret);
  if (cookieVal && timingSafeEqualHex(cookieVal, expected)) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/feed", request.url));
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
