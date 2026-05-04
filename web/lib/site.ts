/** 한국어 표기 우선, 영문 브랜드 Whyup */
export const SITE_NAME_KO = "왜 올라";
export const SITE_NAME_EN = "Whyup";
export const SITE_TAGLINE =
  "미국 증권 공시가 왜 올랐는지, 왜 내려갔는지 AI가 의도·재무 영향·결론으로 정리합니다.";

/**
 * 절대 URL용 베이스. Vercel에서는 NEXT_PUBLIC_SITE_URL이 없어도 VERCEL_URL로 잡힙니다.
 */
export function getSiteUrl(): URL {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) {
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
  return new URL("http://localhost:3000");
}
