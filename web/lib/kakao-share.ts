import { PRODUCTION_SITE_ORIGIN } from "@/lib/site";

/** 카카오 개발자 센터 JavaScript 키 */
export const KAKAO_JAVASCRIPT_KEY = "32475a3b053ee93e162ff7667e8d0fd2";

export const KAKAO_SDK_URL =
  "https://t1.kakaocdn.net/kakao_js_sdk/2.7.9/kakao.min.js";
export const KAKAO_SDK_INTEGRITY =
  "sha384-JpLApTkB8lPskhVMhT+m5Ln8aHlnS0bsIexhaak0jOhAkMYedQoVghPfSpjNi9K1";

/** www는 apex로 301 되므로 공유·OG는 공개 도메인을 쓴다. */
export const SHARE_ORIGIN = PRODUCTION_SITE_ORIGIN;
export const DEFAULT_SHARE_IMAGE_PATH = "/og-share.jpg";
const DEFAULT_SHARE_IMAGE = `${SHARE_ORIGIN}${DEFAULT_SHARE_IMAGE_PATH}`;

export type KakaoShareInput = {
  pageUrl: string;
  title: string;
  description: string;
  imageUrl: string | null;
  buttonTitle?: string;
};

export function getSharePageUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return new URL(normalized, SHARE_ORIGIN).toString();
}

export function getNewsShareUrl(newsId: string): string {
  return getSharePageUrl(`/news/${newsId}`);
}

export function getWireNewsShareUrl(id: string): string {
  return getSharePageUrl(`/news-sec/${id}`);
}

export function getDefaultShareImageUrl(): string {
  return DEFAULT_SHARE_IMAGE;
}

export function resolveShareImageUrl(imageUrl: string | null | undefined): string {
  if (imageUrl && /^https?:\/\//i.test(imageUrl)) return imageUrl;
  if (imageUrl && imageUrl.startsWith("/")) return `${SHARE_ORIGIN}${imageUrl}`;
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
  const link = input.pageUrl;
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
        title: input.buttonTitle ?? "뉴스 보기",
        link: {
          mobileWebUrl: link,
          webUrl: link,
        },
      },
    ],
    installTalk: true,
  };
}

export function initKakaoSdk(): boolean {
  if (typeof window === "undefined") return false;
  const Kakao = window.Kakao;
  if (!Kakao) return false;
  try {
    if (!Kakao.isInitialized()) Kakao.init(KAKAO_JAVASCRIPT_KEY);
    return Kakao.isInitialized();
  } catch {
    return false;
  }
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

export function getRedditShareUrl(pageUrl: string, title: string): string {
  const params = new URLSearchParams({
    url: pageUrl,
    title: truncateShareText(title, 300),
  });
  return `https://www.reddit.com/submit?${params.toString()}`;
}

export function getTelegramShareUrl(pageUrl: string, text: string): string {
  const params = new URLSearchParams({
    url: pageUrl,
    text: truncateShareText(text, 200),
  });
  return `https://t.me/share/url?${params.toString()}`;
}

export function getLineShareUrl(pageUrl: string): string {
  return `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(pageUrl)}`;
}

export function getWhatsAppShareUrl(pageUrl: string, text: string): string {
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(`${truncateShareText(text, 180)}\n${pageUrl}`)}`;
}

export function getLinkedInShareUrl(pageUrl: string): string {
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(pageUrl)}`;
}

export function openSharePopup(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer,width=640,height=520");
}

declare global {
  interface Window {
    Kakao?: {
      isInitialized: () => boolean;
      init: (key: string) => void;
      Share: {
        sendDefault: (options: ReturnType<typeof buildKakaoSharePayload>) => void;
      };
    };
  }
}
