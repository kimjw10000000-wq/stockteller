/** 한국어 표기 우선, 영문 브랜드 Whyup */
export const SITE_NAME_KO = "왜 올라";
export const SITE_NAME_EN = "Whyup";
export const SITE_TAGLINE =
  "미국 증권 공시가 왜 올랐는지, 왜 내려갔는지 AI가 의도·재무 영향·결론으로 정리합니다.";

export function getSiteUrl(): URL {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  try {
    return new URL(raw.endsWith("/") ? raw.slice(0, -1) : raw);
  } catch {
    return new URL("http://localhost:3000");
  }
}
