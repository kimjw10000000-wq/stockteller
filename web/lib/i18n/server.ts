import { cookies, headers } from "next/headers";
import {
  isLocale,
  localeFromAcceptLanguage,
  LOCALE_COOKIE,
  LOCALE_HEADER,
  type Locale,
} from "@/lib/i18n/config";
import { translate, type TranslateValues } from "@/lib/i18n/translate";

export function getRequestLocale(): Locale {
  const header = headers().get(LOCALE_HEADER);
  if (isLocale(header)) return header;
  const cookie = cookies().get(LOCALE_COOKIE)?.value;
  if (isLocale(cookie)) return cookie;
  return localeFromAcceptLanguage(headers().get("accept-language"));
}

export function tServer(key: string, values?: TranslateValues, locale?: Locale): string {
  return translate(locale ?? getRequestLocale(), key, values);
}
