import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAdminEmails, isAdminEmail, logAdminAuthDebug } from "@/lib/admin-auth";
import { createSupabaseMiddlewareClient } from "@/lib/supabase/middleware-client";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  const response = NextResponse.next({ request });
  const supabase = createSupabaseMiddlewareClient(request, response);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoginPage = pathname === "/admin" || pathname === "/admin/";

  if (isLoginPage) {
    if (user && isAdminEmail(user.email)) {
      return NextResponse.redirect(new URL("/admin/dashboard", request.url));
    }
    return response;
  }

  if (!user || !isAdminEmail(user.email)) {
    if (!user) {
      console.log("[middleware/admin] no user", {
        pathname,
        adminEmailsConfigured: getAdminEmails().length,
      });
    } else {
      logAdminAuthDebug("middleware denied", user.email, { pathname });
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/admin";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
