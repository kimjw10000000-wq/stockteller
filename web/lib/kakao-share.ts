/** 카카오 개발자 센터 JavaScript 키 */
export const KAKAO_JAVASCRIPT_KEY = "32475a3b053ee93e162ff7667e8d0fd2";

export const KAKAO_SDK_URL =
  "https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js";

const SHARE_HOST = "https://www.whyup.net";
const DEFAULT_SHARE_IMAGE = `${SHARE_HOST}/website.png`;

export type KakaoShareInput = {
  newsId: string;
  title: string;
  description: string;
  imageUrl: string | null;
};

export function getNewsShareUrl(newsId: string): string {
  return `${SHARE_HOST}/news/${newsId}`;
}

export function resolveShareImageUrl(imageUrl: string | null): string {
  if (imageUrl && /^https?:\/\//i.test(imageUrl)) return imageUrl;
  return DEFAULT_SHARE_IMAGE;
}

export function truncateShareText(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trim()}…`;
}

export function buildShareDescription(summary: string | null | undefined, title: string): string {
  const fromSummary = summary?.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 2).join(" ");
  return truncateShareText(fromSummary || title, 200);
}

export function buildKakaoSharePayload(input: KakaoShareInput) {
  const link = getNewsShareUrl(input.newsId);
  const imageUrl = resolveShareImageUrl(input.imageUrl);

  return {
    objectType: "feed" as const,
    content: {
      title: truncateShareText(input.title, 80),
      description: truncateShareText(input.description, 200),
      imageUrl,
      link: {
        mobileWebUrl: link,
        webUrl: link,
      },
    },
    buttons: [
      {
        title: "뉴스 보기",
        link: {
          mobileWebUrl: link,
          webUrl: link,
        },
      },
    ],
  };
}

export function getFacebookShareUrl(pageUrl: string): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`;
}

export function getTwitterShareUrl(pageUrl: string, text: string): string {
  const params = new URLSearchParams({
    url: pageUrl,
    text: truncateShareText(text, 100),
  });
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

export function openSharePopup(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer,width=640,height=520");
}
