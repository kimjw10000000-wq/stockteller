"use client";

import Script from "next/script";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  buildKakaoSharePayload,
  KAKAO_JAVASCRIPT_KEY,
  KAKAO_SDK_URL,
} from "@/lib/kakao-share";

type KakaoShareButtonProps = {
  newsId: string;
  title: string;
  description: string;
  imageUrl: string | null;
};

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

export function KakaoShareButton({
  newsId,
  title,
  description,
  imageUrl,
}: KakaoShareButtonProps) {
  const [sdkReady, setSdkReady] = useState(false);
  const [sharing, setSharing] = useState(false);

  const initKakao = useCallback(() => {
    try {
      const Kakao = window.Kakao;
      if (!Kakao) {
        console.error("[kakao-share] Kakao SDK object missing after script load");
        return;
      }
      if (!Kakao.isInitialized()) {
        Kakao.init(KAKAO_JAVASCRIPT_KEY);
      }
      setSdkReady(true);
    } catch (err) {
      console.error("[kakao-share] SDK init failed", err);
    }
  }, []);

  const handleShare = useCallback(() => {
    const Kakao = window.Kakao;
    if (!Kakao?.isInitialized()) {
      console.error("[kakao-share] SDK not initialized", { newsId });
      return;
    }

    setSharing(true);
    try {
      Kakao.Share.sendDefault(
        buildKakaoSharePayload({ newsId, title, description, imageUrl })
      );
    } catch (err) {
      console.error("[kakao-share] sendDefault failed", err, { newsId, title });
    } finally {
      setSharing(false);
    }
  }, [newsId, title, description, imageUrl]);

  return (
    <>
      <Script
        src={KAKAO_SDK_URL}
        strategy="lazyOnload"
        onLoad={initKakao}
        onError={() => console.error("[kakao-share] SDK script failed to load")}
      />
      <Button
        type="button"
        size="sm"
        disabled={!sdkReady || sharing}
        onClick={handleShare}
        className="gap-2 bg-[#FEE500] text-[#191919] hover:bg-[#FEE500]/90 disabled:opacity-60"
        aria-label="카카오톡으로 뉴스 공유"
      >
        <KakaoTalkIcon />
        {sharing ? "공유 중…" : "카카오톡 공유"}
      </Button>
    </>
  );
}

function KakaoTalkIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      aria-hidden
      className="shrink-0"
      fill="currentColor"
    >
      <path d="M12 3C6.48 3 2 6.58 2 11c0 2.84 1.87 5.35 4.69 6.78-.15.55-.97 3.55-1 3.73 0 .07.02.15.1.19.08.04.16.03.23-.01.1-.06 3.93-2.6 4.54-3.02.67.1 1.36.15 2.05.15 5.52 0 10-3.58 10-8.02C22.44 6.58 17.52 3 12 3z" />
    </svg>
  );
}
