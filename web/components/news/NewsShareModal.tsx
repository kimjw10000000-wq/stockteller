"use client";

import { useCallback, useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Share2, X } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { Button } from "@/components/ui/button";
import {
  buildKakaoSharePayload,
  getFacebookShareUrl,
  getLineShareUrl,
  getLinkedInShareUrl,
  getRedditShareUrl,
  getTelegramShareUrl,
  getTwitterShareUrl,
  getWhatsAppShareUrl,
  initKakaoSdk,
  openSharePopup,
} from "@/lib/kakao-share";

type NewsShareModalProps = {
  url: string;
  title: string;
  description: string;
  imageUrl?: string | null;
  variant?: "button" | "icon";
};

export function NewsShareModal({
  url,
  title,
  description,
  imageUrl = null,
  variant = "button",
}: NewsShareModalProps) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
  }, []);

  const handleKakaoShare = useCallback(() => {
    if (!initKakaoSdk() || !window.Kakao?.Share) {
      showToast(t("news.shareKakaoUnavailable"));
      return;
    }
    try {
      window.Kakao.Share.sendDefault(
        buildKakaoSharePayload({ pageUrl: url, title, description, imageUrl })
      );
    } catch (err) {
      console.error("[share] Kakao sendDefault failed", err, { url, title });
      showToast(t("news.shareKakaoFailed"));
    }
  }, [url, title, description, imageUrl, showToast, t]);

  const handleFacebookShare = useCallback(() => {
    openSharePopup(getFacebookShareUrl(url));
  }, [url]);

  const handleTwitterShare = useCallback(() => {
    openSharePopup(getTwitterShareUrl(url, title));
  }, [url, title]);

  const handleRedditShare = useCallback(() => {
    openSharePopup(getRedditShareUrl(url, title));
  }, [url, title]);

  const handleTelegramShare = useCallback(() => {
    openSharePopup(getTelegramShareUrl(url, title));
  }, [url, title]);

  const handleLineShare = useCallback(() => {
    openSharePopup(getLineShareUrl(url));
  }, [url]);

  const handleWhatsAppShare = useCallback(() => {
    openSharePopup(getWhatsAppShareUrl(url, title));
  }, [url, title]);

  const handleLinkedInShare = useCallback(() => {
    openSharePopup(getLinkedInShareUrl(url));
  }, [url]);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      showToast(t("news.copied"));
    } catch (err) {
      console.error("[share] clipboard copy failed", err);
      window.prompt("링크를 복사하세요:", url);
    }
  }, [url, showToast, t]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

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

  const openModal = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(true);
  };

  const modal =
    isOpen && mounted
      ? createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-modal-title"
          >
            <button
              type="button"
              className="fixed inset-0 bg-black/50 backdrop-blur-sm"
              aria-label={t("news.shareClose")}
              onClick={() => setIsOpen(false)}
            />

            <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
              <div className="mb-5 flex items-center justify-between">
                <h2 id="share-modal-title" className="text-lg font-semibold text-foreground">
                  {t("news.share")}
                </h2>
                <button
                  type="button"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted active:bg-muted"
                  onClick={() => setIsOpen(false)}
                  aria-label={t("news.close")}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mb-6 grid grid-cols-4 gap-x-2 gap-y-5">
                <ShareCircleButton
                  label={t("news.kakao")}
                  onClick={handleKakaoShare}
                  className="bg-[#FEE500] text-[#191919] hover:bg-[#FEE500]/90"
                >
                  <KakaoIcon />
                </ShareCircleButton>
                <ShareCircleButton
                  label={t("news.telegram")}
                  onClick={handleTelegramShare}
                  className="bg-[#229ED9] text-white hover:bg-[#229ED9]/90"
                >
                  <TelegramIcon />
                </ShareCircleButton>
                <ShareCircleButton
                  label={t("news.line")}
                  onClick={handleLineShare}
                  className="bg-[#06C755] text-white hover:bg-[#06C755]/90"
                >
                  <LineIcon />
                </ShareCircleButton>
                <ShareCircleButton
                  label={t("news.whatsapp")}
                  onClick={handleWhatsAppShare}
                  className="bg-[#25D366] text-white hover:bg-[#25D366]/90"
                >
                  <WhatsAppIcon />
                </ShareCircleButton>
                <ShareCircleButton
                  label={t("news.twitter")}
                  onClick={handleTwitterShare}
                  className="bg-foreground text-background hover:bg-foreground/90"
                >
                  <XIcon />
                </ShareCircleButton>
                <ShareCircleButton
                  label={t("news.reddit")}
                  onClick={handleRedditShare}
                  className="bg-[#FF4500] text-white hover:bg-[#FF4500]/90"
                >
                  <RedditIcon />
                </ShareCircleButton>
                <ShareCircleButton
                  label={t("news.facebook")}
                  onClick={handleFacebookShare}
                  className="bg-[#1877F2] text-white hover:bg-[#1877F2]/90"
                >
                  <FacebookIcon />
                </ShareCircleButton>
                <ShareCircleButton
                  label={t("news.linkedin")}
                  onClick={handleLinkedInShare}
                  className="bg-[#0A66C2] text-white hover:bg-[#0A66C2]/90"
                >
                  <LinkedInIcon />
                </ShareCircleButton>
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 p-2">
                <input
                  readOnly
                  value={url}
                  aria-label={t("news.shareLinkAria")}
                  className="min-w-0 flex-1 truncate bg-transparent px-2 text-sm text-muted-foreground outline-none"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => void handleCopyLink()}
                >
                  {t("news.copy")}
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  const toastNode =
    toast && mounted
      ? createPortal(
          <div
            role="status"
            className="fixed bottom-6 left-1/2 z-[110] max-w-[90vw] -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-center text-sm font-medium text-background shadow-lg"
          >
            {toast}
          </div>,
          document.body
        )
      : null;

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={openModal}
          className="inline-flex h-8 items-center gap-1 rounded-full px-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={t("news.shareCta")}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
        >
          <Share2 className="h-4 w-4 shrink-0" aria-hidden />
          {t("news.shareCta")}
        </button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={openModal}
          className="gap-2 rounded-full border-border/80 bg-muted/40 px-4 text-foreground hover:bg-muted/70"
          aria-haspopup="dialog"
          aria-expanded={isOpen}
        >
          <Share2 className="h-4 w-4" aria-hidden />
          {t("news.share")}
        </Button>
      )}

      {modal}
      {toastNode}
    </>
  );
}

type ShareCircleButtonProps = {
  label: string;
  onClick: () => void;
  className: string;
  children: ReactNode;
};

function ShareCircleButton({ label, onClick, className, children }: ShareCircleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full flex-col items-center gap-2"
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

function RedditIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm6.24 8.16c.2.2.32.43.32.67 0 1.7-1.97 3.1-4.4 3.42.18.48.3 1 .3 1.53 0 2.07-2.01 3.75-4.5 3.75s-4.5-1.68-4.5-3.75c0-.53.12-1.05.3-1.53-2.43-.32-4.4-1.72-4.4-3.42 0-.24.12-.47.32-.67.5-.49 1.32-.5 1.86-.07.7-.45 1.57-.78 2.54-.94l.54-2.55a.75.75 0 0 1 .71-.47l2.63.56c.5-.31 1.1-.49 1.74-.49.55 0 1 .45 1 1 0 .38-.21.7-.52.87.06.4.1.83.1 1.27 0 .18-.02.35-.05.53zM8.5 13.5a1 1 0 1 0 2 0 1 1 0 0 0-2 0zm5.5 3.03c-.7.7-2.03.76-2.53.76s-1.83-.06-2.53-.76a.5.5 0 1 1 .71-.71c.45.45 1.37.48 1.82.48s1.37-.03 1.82-.48a.5.5 0 1 1 .71.71zM14.5 14.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <path d="M21.5 3.3 2.8 10.5c-1.3.5-1.3 1.2-.2 1.5l4.8 1.5 11.1-7c.5-.3 1-.1.6.2l-9 8.2-.3 4.8c.5 0 .7-.2 1-.5l2.4-2.3 5 3.7c.9.5 1.6.2 1.8-.9l3.3-15.5c.3-1.4-.5-2-1.8-1.5z" />
    </svg>
  );
}

function LineIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <path d="M12 3C6.5 3 2 6.6 2 11c0 4 3.4 7.4 8.1 8.1.3.1.8.3.9.6.1.3.1.7 0 1l-.2.9c0 .3-.2 1.1 1 .6 1.2-.5 6.4-3.8 8.7-6.5C21.8 14.2 22 12.6 22 11 22 6.6 17.5 3 12 3zm-4.2 10.2H6.3V8.8h1.5v4.4zm3.1 0H9.4l1.6-4.4h1.6l-1.6 4.4zm4.4 0h-1.5V8.8h1.5v4.4zm3.2 0h-2.7V8.8h1.5v3.1H18.5v1.3z" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.7-1.2A9 9 0 1 0 12 3zm5 12.3c-.2.6-1.2 1.1-1.7 1.1-.4 0-.9.2-3-.8-2.5-1.2-4.1-3.9-4.2-4.1-.1-.2-1-1.3-1-2.5s.6-1.8.9-2c.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2 0 .4-.1.5l-.3.4c-.2.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.2 1.4 2.5 1.5.3.2.5.1.7-.1l.9-1.2c.2-.2.4-.2.6-.1l2 .9c.2.1.4.2.4.5 0 .2 0 1.2-.6 1.8z" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <path d="M6.5 8.5H3.8V20h2.7V8.5zM5.1 4C4.2 4 3.4 4.8 3.4 5.7c0 .9.8 1.7 1.7 1.7s1.7-.8 1.7-1.7C6.8 4.8 6 4 5.1 4zM20.2 20h-2.7v-5.6c0-1.3 0-3-1.8-3s-2.1 1.4-2.1 2.9V20H11V8.5h2.6v1.6c.4-.7 1.3-1.8 3.3-1.8 3.5 0 4.1 2.3 4.1 5.3V20z" />
    </svg>
  );
}
