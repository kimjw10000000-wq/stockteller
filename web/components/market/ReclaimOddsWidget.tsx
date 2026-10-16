"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { ReclaimOddsFocus } from "@/components/market/ReclaimOddsList";
import { reclaimOddsUrl } from "@/lib/us-market/washout-chart-url";
import {
  ODDS_PIP_CSS,
  ODDS_PIP_H,
  ODDS_PIP_W,
  bindReclaimWidgetControls,
  cardDisplayName,
  cardsSignature,
  focusedReclaimCard,
  getReclaimWidgetState,
  oddsWidgetBodyHtml,
  paintOddsWidget,
  patchReclaimWidget,
  reclaimWatchers,
  sortReclaimCards,
  subscribeReclaimWatchers,
  subscribeReclaimWidget,
  type OddsWidgetCopy,
  type ReclaimCard,
} from "@/lib/us-market/reclaim-widget";

type PipApi = {
  requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>;
};

type WebkitVideo = HTMLVideoElement & {
  webkitSupportsPresentationMode?: (mode: "picture-in-picture" | "inline" | "fullscreen") => boolean;
  webkitSetPresentationMode?: (mode: "picture-in-picture" | "inline" | "fullscreen") => void;
  webkitPresentationMode?: string;
};

function pipApi(): PipApi | null {
  const api = (window as Window & { documentPictureInPicture?: PipApi }).documentPictureInPicture;
  if (!api || typeof api.requestWindow !== "function") return null;
  return api;
}

export function useReclaimWidgetState() {
  return useSyncExternalStore(subscribeReclaimWidget, getReclaimWidgetState, getReclaimWidgetState);
}

export function ReclaimOddsWidget() {
  const { t, locale } = useI18n();
  const { cards, mode, ticker } = useReclaimWidgetState();
  const copy = useMemo<OddsWidgetCopy>(
    () => ({
      title: t("similar.oddsTitle"),
      until: t("similar.oddsUntil"),
      reclaim: t("similar.oddsReclaim"),
      above: t("similar.oddsAboveTop"),
      empty: t("similar.membersEmpty"),
      loading: t("similar.oddsLoading"),
      next: (edge: number) => t("similar.oddsNext", { edge }),
    }),
    [t],
  );

  const modeRef = useRef(mode);
  modeRef.current = mode;
  const copyRef = useRef(copy);
  copyRef.current = copy;
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const pipRef = useRef<Window | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const openingRef = useRef(false);
  const videoPendingRef = useRef(false);
  const tickRef = useRef<() => void>(() => undefined);
  const paintRef = useRef<() => void>(() => undefined);
  const armRef = useRef<() => void>(() => undefined);

  const paintNow = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    paintOddsWidget(ctx, focusedReclaimCard(), copyRef.current, localeRef.current);
    try {
      ctx.getImageData(0, 0, 1, 1);
    } catch {
      /* ignore */
    }
    const stream = videoRef.current?.srcObject;
    if (stream instanceof MediaStream) {
      const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;
      try {
        track?.requestFrame();
      } catch {
        /* ignore */
      }
    }
  }, []);
  paintRef.current = paintNow;

  const fillPip = useCallback((pip: Window) => {
    const doc = pip.document;
    if (!doc.getElementById("odds-scroll")) {
      doc.documentElement.lang = localeRef.current;
      const style = doc.createElement("style");
      style.textContent = ODDS_PIP_CSS;
      doc.head.appendChild(style);
      doc.body.style.margin = "0";
      const scroll = doc.createElement("div");
      scroll.id = "odds-scroll";
      doc.body.appendChild(scroll);
    }
    const card = focusedReclaimCard();
    doc.title = card ? `${card.ticker} · ${cardDisplayName(card, localeRef.current)}` : copyRef.current.title;
    const scroller = doc.getElementById("odds-scroll");
    if (!scroller) return;
    scroller.innerHTML = oddsWidgetBodyHtml(card, copyRef.current, localeRef.current);
  }, []);

  const ensureStream = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || typeof canvas.captureStream !== "function") return false;
    paintNow();
    if (!video.srcObject) {
      try {
        video.srcObject = canvas.captureStream();
      } catch {
        return false;
      }
    }
    return true;
  }, [paintNow]);

  const close = useCallback(() => {
    openingRef.current = false;
    videoPendingRef.current = false;
    const pip = pipRef.current;
    pipRef.current = null;
    patchReclaimWidget({ mode: "off", ticker: null });
    if (pip && !pip.closed) {
      try {
        pip.close();
      } catch {
        /* ignore */
      }
    }
    const video = videoRef.current;
    if (video && document.pictureInPictureElement === video) {
      void document.exitPictureInPicture().catch(() => undefined);
    }
    const webkit = video as WebkitVideo | null;
    if (webkit?.webkitPresentationMode === "picture-in-picture") {
      try {
        webkit.webkitSetPresentationMode?.("inline");
      } catch {
        /* ignore */
      }
    }
    video?.pause();
  }, []);

  const startVideo = useCallback(() => {
    if (videoPendingRef.current) return true;
    if (!ensureStream()) return false;
    const video = videoRef.current;
    if (!video) return false;
    try {
      if ("mediaSession" in navigator) {
        const card = focusedReclaimCard();
        navigator.mediaSession.metadata = new MediaMetadata({
          title: card ? `${card.ticker} · ${cardDisplayName(card, localeRef.current)}` : copyRef.current.title,
          artist: "whyup",
        });
      }
    } catch {
      /* ignore */
    }
    // iOS drops the gesture if play() or requestPictureInPicture() is awaited.
    const play = video.play();
    if (play) void play.catch(() => undefined);
    const webkit = video as WebkitVideo;
    const enterWebkit = () => {
      if (!webkit.webkitSetPresentationMode || !webkit.webkitSupportsPresentationMode?.("picture-in-picture")) {
        return false;
      }
      try {
        webkit.webkitSetPresentationMode("picture-in-picture");
      } catch {
        return false;
      }
      return webkit.webkitPresentationMode === "picture-in-picture";
    };
    if (typeof video.requestPictureInPicture === "function") {
      videoPendingRef.current = true;
      void video.requestPictureInPicture().then(() => {
        videoPendingRef.current = false;
        patchReclaimWidget({ mode: "video" });
      }).catch(() => {
        videoPendingRef.current = false;
        if (document.pictureInPictureElement === video) {
          patchReclaimWidget({ mode: "video" });
          return;
        }
        if (enterWebkit()) patchReclaimWidget({ mode: "video" });
        else if (getReclaimWidgetState().mode !== "document") patchReclaimWidget({ mode: "panel" });
      });
      return true;
    }
    if (enterWebkit()) {
      patchReclaimWidget({ mode: "video" });
      return true;
    }
    return false;
  }, [ensureStream]);

  const open = useCallback(() => {
    if (openingRef.current || videoPendingRef.current || modeRef.current !== "off") return;
    const api = pipApi();
    if (api) {
      openingRef.current = true;
      void api.requestWindow({ width: 440, height: 300 }).then((pip) => {
        openingRef.current = false;
        pipRef.current = pip;
        fillPip(pip);
        const onHide = () => {
          if (pipRef.current === pip) pipRef.current = null;
          if (modeRef.current === "document") patchReclaimWidget({ mode: "off" });
        };
        pip.addEventListener("pagehide", onHide);
        patchReclaimWidget({ mode: "document" });
      }).catch(() => {
        openingRef.current = false;
        if (!startVideo()) patchReclaimWidget({ mode: "panel" });
      });
      return;
    }
    if (!startVideo()) patchReclaimWidget({ mode: "panel" });
  }, [fillPip, startVideo]);

  useEffect(() => bindReclaimWidgetControls({ open, close }), [open, close]);

  useEffect(() => {
    const video = document.createElement("video");
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.controls = false;
    video.disablePictureInPicture = false;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.setAttribute("muted", "");
    video.width = ODDS_PIP_W;
    video.height = ODDS_PIP_H;
    video.setAttribute("aria-hidden", "true");
    video.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;";
    document.body.appendChild(video);
    videoRef.current = video;

    const canvas = document.createElement("canvas");
    canvas.width = ODDS_PIP_W;
    canvas.height = ODDS_PIP_H;
    canvas.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;";
    document.body.appendChild(canvas);
    canvasRef.current = canvas;

    const onEnter = () => {
      videoPendingRef.current = false;
      patchReclaimWidget({ mode: "video" });
    };
    const onLeave = () => {
      videoPendingRef.current = false;
      if (modeRef.current === "video") patchReclaimWidget({ mode: "off" });
      video.pause();
    };
    const onWebkit = () => {
      const presentation = (video as WebkitVideo).webkitPresentationMode;
      if (presentation === "picture-in-picture") patchReclaimWidget({ mode: "video" });
      else if (modeRef.current === "video") patchReclaimWidget({ mode: "off" });
    };
    let lastPaint = 0;
    const onTime = () => {
      if (modeRef.current !== "video") return;
      const now = Date.now();
      if (now - lastPaint < 700) return;
      lastPaint = now;
      paintRef.current();
      tickRef.current();
    };
    video.addEventListener("enterpictureinpicture", onEnter);
    video.addEventListener("leavepictureinpicture", onLeave);
    video.addEventListener("webkitpresentationmodechanged", onWebkit);
    video.addEventListener("timeupdate", onTime);

    return () => {
      video.removeEventListener("enterpictureinpicture", onEnter);
      video.removeEventListener("leavepictureinpicture", onLeave);
      video.removeEventListener("webkitpresentationmodechanged", onWebkit);
      video.removeEventListener("timeupdate", onTime);
      if (document.pictureInPictureElement === video) void document.exitPictureInPicture().catch(() => undefined);
      const pip = pipRef.current;
      if (pip && !pip.closed) {
        try {
          pip.close();
        } catch {
          /* ignore */
        }
      }
      video.pause();
      video.srcObject = null;
      video.remove();
      canvas.remove();
      videoRef.current = null;
      canvasRef.current = null;
    };
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer = 0;
    const tick = async () => {
      const live = modeRef.current !== "off";
      if (!live && reclaimWatchers() === 0) return;
      if (document.hidden && !live) return;
      try {
        const res = await fetch(reclaimOddsUrl(), { cache: "no-store" });
        if (stopped) return;
        if (!res.ok) {
          if (getReclaimWidgetState().cards == null) patchReclaimWidget({ cards: [] });
          return;
        }
        const json = (await res.json()) as { cards?: ReclaimCard[] };
        if (!Array.isArray(json.cards)) {
          if (getReclaimWidgetState().cards == null) patchReclaimWidget({ cards: [] });
          return;
        }
        const next = sortReclaimCards(json.cards);
        const prev = getReclaimWidgetState().cards;
        if (prev && cardsSignature(prev) === cardsSignature(next)) return;
        patchReclaimWidget({ cards: next });
      } catch {
        if (!stopped && getReclaimWidgetState().cards == null) patchReclaimWidget({ cards: [] });
      }
    };
    tickRef.current = () => {
      void tick();
    };
    const arm = () => {
      window.clearInterval(timer);
      if (stopped) return;
      if (modeRef.current === "off" && reclaimWatchers() === 0) return;
      void tick();
      timer = window.setInterval(() => void tick(), 1000);
    };
    armRef.current = arm;
    arm();
    const unsub = subscribeReclaimWatchers(arm);
    const onVisible = () => {
      if (!document.hidden || modeRef.current !== "off") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      unsub();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    armRef.current();
  }, [mode]);

  useEffect(() => {
    if (mode !== "document") return;
    const pip = pipRef.current;
    if (!pip || pip.closed) return;
    fillPip(pip);
  }, [mode, cards, copy, locale, ticker, fillPip]);

  useEffect(() => {
    if (mode !== "video") return;
    paintNow();
  }, [mode, cards, copy, locale, ticker, paintNow]);

  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  if (mode !== "panel") return null;

  return (
    <div
      role="dialog"
      aria-label={copy.title}
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-[80] w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-foreground/15 bg-white shadow-xl"
      style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
    >
      <div
        className="flex cursor-grab touch-none items-center justify-between gap-2 px-3 py-2 active:cursor-grabbing"
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest("button")) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          const panel = event.currentTarget.parentElement;
          if (!drag || !panel) return;
          const rect = panel.getBoundingClientRect();
          let x = drag.ox + event.clientX - drag.x;
          let y = drag.oy + event.clientY - drag.y;
          const dx = x - offset.x;
          const dy = y - offset.y;
          const left = rect.left + dx;
          const top = rect.top + dy;
          const minLeft = 8 - rect.width + 72;
          const maxLeft = window.innerWidth - 72;
          const minTop = 8;
          const maxTop = window.innerHeight - 48;
          if (left < minLeft) x += minLeft - left;
          if (left > maxLeft) x += maxLeft - left;
          if (top < minTop) y += minTop - top;
          if (top > maxTop) y += maxTop - top;
          setOffset({ x, y });
        }}
        onPointerUp={() => {
          dragRef.current = null;
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
      >
        <p className="text-sm font-medium text-foreground">{copy.title}</p>
        <button
          type="button"
          onClick={close}
          className="shrink-0 rounded-full bg-foreground px-2.5 py-1 text-xs font-medium text-background"
        >
          {t("similar.oddsFloatClose")}
        </button>
      </div>
      <ReclaimOddsFocus card={cards?.find((row) => row.ticker === ticker) ?? null} />
    </div>
  );
}
