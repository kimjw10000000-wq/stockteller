"use client";

import Script from "next/script";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  buildKakaoSharePayload,
  getFacebookShareUrl,
  getNewsShareUrl,
  getTwitterShareUrl,
  KAKAO_JAVASCRIPT_KEY,
  KAKAO_SDK_URL,
  openSharePopup,
} from "@/lib/kakao-share";

type NewsShareModalProps = {
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

export function NewsShareModal({
  newsId,
  title,
  description,
  imageUrl,
}: NewsShareModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const [copiedToast, setCopiedToast] = useState(false);
  const [mounted, setMounted] = useState(false);

  const shareUrl = getNewsShareUrl(newsId);

  useEffect(() => {
    setMounted(true);
  }, []);

  const initKakao = useCallback(() => {
    try {
      const Kakao = window.Kakao;
      if (!Kakao) {
        console.error("[share] Kakao SDK missing after script load");
        return;
      }
      if (!Kakao.isInitialized()) {
        Kakao.init(KAKAO_JAVASCRIPT_KEY);
      }
      setSdkReady(true);
    } catch (err) {
      console.error("[share] Kakao init failed", err);
    }
  }, []);

  const handleKakaoShare = useCallback(() => {
    const Kakao = window.Kakao;
    if (!Kakao?.isInitialized()) {
      console.error("[share] Kakao SDK not ready", { newsId });
      return;
    }
    try {
      Kakao.Share.sendDefault(
        buildKakaoSharePayload({ newsId, title, description, imageUrl })
      );
    } catch (err) {
      console.error("[share] Kakao sendDefault failed", err, { newsId, title });
    }
  }, [newsId, title, description, imageUrl]);

  const handleFacebookShare = useCallback(() => {
    openSharePopup(getFacebookShareUrl(shareUrl));
  }, [shareUrl]);

  const handleTwitterShare = useCallback(() => {
    openSharePopup(getTwitterShareUrl(shareUrl, title));
  }, [shareUrl, title]);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedToast(true);
    } catch (err) {
      console.error("[share] clipboard copy failed", err);
      window.prompt("링크를 복사하세요:", shareUrl);
    }
  }, [shareUrl]);

  useEffect(() => {
    if (!copiedToast) return;
    const timer = window.setTimeout(() => setCopiedToast(false), 2400);
    return () => window.clearTimeout(timer);
  }, [copiedToast]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  const modal =
    isOpen && mounted
      ? createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-modal-title"
          >
            {/* 딤드 배경 — 클릭 시 닫기 */}
            <button
              type="button"
              className="fixed inset-0 bg-black/50 backdrop-blur-sm"
              aria-label="공유 창 닫기"
              onClick={() => setIsOpen(false)}
            />

            {/* 모바일·데스크톱 공통: 뷰포트 정중앙 카드 */}
            <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
              <div className="mb-5 flex items-center justify-between">
                <h2 id="share-modal-title" className="text-lg font-semibold text-foreground">
                  공유
                </h2>
                <button
                  type="button"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted active:bg-muted"
                  onClick={() => setIsOpen(false)}
                  aria-label="닫기"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mb-6 flex items-start justify-center gap-6">
                <ShareCircleButton
                  label="카카오톡"
                  disabled={!sdkReady}
                  onClick={handleKakaoShare}
                  className="bg-[#FEE500] text-[#191919] hover:bg-[#FEE500]/90"
                >
                  <KakaoIcon />
                </ShareCircleButton>
                <ShareCircleButton
                  label="페이스북"
                  onClick={handleFacebookShare}
                  className="bg-[#1877F2] text-white hover:bg-[#1877F2]/90"
                >
                  <FacebookIcon />
                </ShareCircleButton>
                <ShareCircleButton
                  label="X"
                  onClick={handleTwitterShare}
                  className="bg-foreground text-background hover:bg-foreground/90"
                >
                  <XIcon />
                </ShareCircleButton>
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 p-2">
                <input
                  readOnly
                  value={shareUrl}
                  aria-label="뉴스 공유 링크"
                  className="min-w-0 flex-1 truncate bg-transparent px-2 text-sm text-muted-foreground outline-none"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => void handleCopyLink()}
                >
                  복사
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  const toast =
    copiedToast && mounted
      ? createPortal(
          <div
            role="status"
            className="fixed bottom-6 left-1/2 z-[110] -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background shadow-lg"
          >
            링크가 복사되었습니다!
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <Script
        src={KAKAO_SDK_URL}
        strategy="lazyOnload"
        onLoad={initKakao}
        onError={() => console.error("[share] Kakao SDK script failed to load")}
      />

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="gap-2 rounded-full border-border/80 bg-muted/40 px-4 text-foreground hover:bg-muted/70"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <Share2 className="h-4 w-4" aria-hidden />
        공유
      </Button>

      {modal}
      {toast}
    </>
  );
}

type ShareCircleButtonProps = {
  label: string;
  onClick: () => void;
  className: string;
  disabled?: boolean;
  children: React.ReactNode;
};

function ShareCircleButton({
  label,
  onClick,
  className,
  disabled,
  children,
}: ShareCircleButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="group flex w-16 flex-col items-center gap-2 disabled:opacity-50"
    >
      <span
        className={`flex h-14 w-14 items-center justify-center rounded-full transition-transform group-hover:scale-105 group-active:scale-95 ${className}`}
      >
        {children}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </button>
  );
}

function KakaoIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <path d="M12 3C6.48 3 2 6.58 2 11c0 2.84 1.87 5.35 4.69 6.78-.15.55-.97 3.55-1 3.73 0 .07.02.15.1.19.08.04.16.03.23-.01.1-.06 3.93-2.6 4.54-3.02.67.1 1.36.15 2.05.15 5.52 0 10-3.58 10-8.02C22.44 6.58 17.52 3 12 3z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <path d="M13.5 3H10c-2.76 0-5 2.24-5 5v3H3v4h2v9h4v-9h3.1l.9-4H9V8c0-.55.45-1 1-1h3.5V3z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <path d="M17.3 3H20l-6.5 7.4L21 21h-5.9l-4.6-6-5.3 6H3.4l7-8L3 3h6l4.2 5.5L17.3 3zm-2 16.2h1.6L8.9 4.7H7.2L15.3 19.2z" />
    </svg>
  );
}
