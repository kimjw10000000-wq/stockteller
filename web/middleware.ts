import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAdminEmails, isAdminEmail, logAdminAuthDebug } from "@/lib/admin-auth";
import {
  isAiTrainingCrawler,
  isInternalAutomation,
  isScraperLibrary,
  isSearchOrPreviewBot,
} from "@/lib/security/crawlers";
import { clientIp, consumeApiRateLimit, isRateLimitExemptPath } from "@/lib/security/rate-limit";
import { createSupabaseMiddlewareClient } from "@/lib/supabase/middleware-client";

function forbidden(): NextResponse {
  return new NextResponse("Forbidden", {
    status: 403,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const ua = request.headers.get("user-agent") ?? "";
  const automated = isInternalAutomation(request);

  if (!automated) {
    if (isAiTrainingCrawler(ua) || (!isSearchOrPreviewBot(ua) && isScraperLibrary(ua))) {
      return forbidden();
    }
    if (pathname.startsWith("/api/") && !ua.trim()) {
      return forbidden();
    }
    if (pathname.startsWith("/api/") && !isRateLimitExemptPath(pathname)) {
      const limited = consumeApiRateLimit(pathname, clientIp(request));
      if (!limited.ok) {
        return new NextResponse("Too Many Requests", {
          status: 429,
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "retry-after": String(limited.retryAfterSec),
          },
        });
      }
    }
  }

  const response = NextResponse.next({ request });
  const supabase = createSupabaseMiddlewareClient(request, response);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!pathname.startsWith("/admin")) {
    return response;
  }

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
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
