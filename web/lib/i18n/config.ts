export const LOCALES = ["ko", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "whyup_locale";
export const LOCALE_HEADER = "x-whyup-locale";
export const LOCALE_STORAGE_KEY = "whyup_locale";

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "ko" || value === "en";
}

/** 한국어 계열만 ko, 그 외는 en */
export function localeFromLanguageTag(tag: string | null | undefined): Locale {
  const raw = tag?.trim().toLowerCase() ?? "";
  if (!raw) return DEFAULT_LOCALE;
  const primary = raw.split(",")[0]?.split(";")[0]?.trim() ?? "";
  if (primary === "ko" || primary.startsWith("ko-")) return "ko";
  return DEFAULT_LOCALE;
}

export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  const parts = header.split(",").map((part) => {
    const [tag, ...params] = part.trim().split(";");
    const q = params.find((p) => p.trim().startsWith("q="));
    const quality = q ? Number(q.trim().slice(2)) : 1;
    return { tag: tag?.trim() ?? "", quality: Number.isFinite(quality) ? quality : 1 };
  });
  parts.sort((a, b) => b.quality - a.quality);
  for (const part of parts) {
    if (part.tag === "*") continue;
    return localeFromLanguageTag(part.tag);
  }
  return DEFAULT_LOCALE;
}

export function localeFromNavigator(): Locale {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE;
  const langs = navigator.languages?.length
    ? navigator.languages
    : navigator.language
      ? [navigator.language]
      : [];
  for (const lang of langs) {
    return localeFromLanguageTag(lang);
  }
  return DEFAULT_LOCALE;
}

export function dateLocale(locale: Locale): string {
  return locale === "ko" ? "ko-KR" : "en-US";
}
