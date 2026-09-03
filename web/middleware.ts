import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAdminEmails, isAdminEmail, logAdminAuthDebug } from "@/lib/admin-auth";
import {
  isForbiddenCrawler,
  isInternalAutomation,
  isMissingBrowserUserAgent,
  isScraperLibrary,
  isSearchOrPreviewBot,
} from "@/lib/security/crawlers";
import {
  clientIp,
  consumeApiRateLimit,
  consumePageRateLimit,
  isRateLimitExemptPath,
} from "@/lib/security/rate-limit";
import { applyLocaleToRequest, stampLocale } from "@/lib/i18n/request-locale";
import { createSupabaseMiddlewareClient } from "@/lib/supabase/middleware-client";

function forbidden(): NextResponse {
  return new NextResponse("Forbidden", {
    status: 403,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

function tooMany(retryAfterSec: number): NextResponse {
  return new NextResponse("Too Many Requests", {
    status: 429,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "retry-after": String(retryAfterSec),
    },
  });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const ua = request.headers.get("user-agent") ?? "";
  const automated = isInternalAutomation(request);

  if (!automated) {
    const searchOrPreview = isSearchOrPreviewBot(ua);
    if (isForbiddenCrawler(ua) || (!searchOrPreview && isScraperLibrary(ua))) {
      return forbidden();
    }
    if (!searchOrPreview && isMissingBrowserUserAgent(ua)) {
      return forbidden();
    }
    const ip = clientIp(request);
    if (pathname.startsWith("/api/") && !isRateLimitExemptPath(pathname)) {
      const limited = consumeApiRateLimit(pathname, ip);
      if (!limited.ok) return tooMany(limited.retryAfterSec);
    } else if (!pathname.startsWith("/api/") && !searchOrPreview) {
      const limited = consumePageRateLimit(ip);
      if (!limited.ok) return tooMany(limited.retryAfterSec);
    }
  }

  const { locale, requestHeaders, hadCookie } = applyLocaleToRequest(request);
  const response = stampLocale(
    NextResponse.next({ request: { headers: requestHeaders } }),
    locale,
    hadCookie
  );

  const needsSession =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/admin") ||
    pathname.startsWith("/api/alerts") ||
    pathname.startsWith("/watchman") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/recover");

  if (!needsSession) {
    return response;
  }

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
      return stampLocale(
        NextResponse.redirect(new URL("/admin/dashboard", request.url)),
        locale,
        hadCookie
      );
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
    return stampLocale(NextResponse.redirect(loginUrl), locale, hadCookie);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
