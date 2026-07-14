/** 한국어 표기 우선, 영문 브랜드 Whyup */
export const SITE_NAME_KO = "왜 올라";
export const SITE_NAME_EN = "Whyup";
export const SITE_TAGLINE =
  "미국 증권 공시가 왜 올랐는지, 왜 내려갔는지 AI가 의도·재무 영향·결론으로 정리합니다.";

/** 프로덕션 공개 도메인 (www → apex 리다이렉트는 Vercel에서 처리) */
export const PRODUCTION_SITE_ORIGIN = "https://whyup.net";

function isLocalDevUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

/**
 * 절대 URL용 베이스.
 * NEXT_PUBLIC_SITE_URL이 localhost로 빌드에 박혀 있어도 프로덕션에서는 whyup.net을 사용합니다.
 */
export function getSiteUrl(): URL {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit && !isLocalDevUrl(explicit)) {
    try {
      return new URL(explicit.endsWith("/") ? explicit.slice(0, -1) : explicit);
    } catch {
      /* fall through */
    }
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//i, "");
    try {
      return new URL(`https://${host}`);
    } catch {
      /* fall through */
    }
  }
  if (process.env.VERCEL === "1" || process.env.NODE_ENV === "production") {
    return new URL(PRODUCTION_SITE_ORIGIN);
  }
  return new URL("http://localhost:3000");
}
