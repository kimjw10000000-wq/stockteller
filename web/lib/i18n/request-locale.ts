import { NextResponse, type NextRequest } from "next/server";
import {
  isLocale,
  localeFromAcceptLanguage,
  LOCALE_COOKIE,
  LOCALE_HEADER,
  type Locale,
} from "@/lib/i18n/config";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function resolveRequestLocale(request: NextRequest): Locale {
  const cookie = request.cookies.get(LOCALE_COOKIE)?.value;
  if (isLocale(cookie)) return cookie;
  return localeFromAcceptLanguage(request.headers.get("accept-language"));
}

export function persistLocaleCookie(response: NextResponse, locale: Locale) {
  response.cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: COOKIE_MAX_AGE,
    sameSite: "lax",
  });
}

export function applyLocaleToRequest(request: NextRequest): {
  locale: Locale;
  requestHeaders: Headers;
  hadCookie: boolean;
} {
  const hadCookie = isLocale(request.cookies.get(LOCALE_COOKIE)?.value);
  const locale = resolveRequestLocale(request);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(LOCALE_HEADER, locale);
  return { locale, requestHeaders, hadCookie };
}

export function stampLocale(response: NextResponse, locale: Locale, hadCookie: boolean) {
  if (!hadCookie) persistLocaleCookie(response, locale);
  return response;
}
