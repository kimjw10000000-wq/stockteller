"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { ensureKoreanShareNames, subscribeKoreanShareNames } from "@/lib/companies/korean-names-client";
import { haltCardFace, type LiveHaltCard } from "@/lib/halts/halt-board";
import { haltLiveUrl } from "@/lib/us-market/washout-chart-url";
import {
  HALT_PIP_H,
  HALT_PIP_W,
  bindHaltWidgetControls,
  focusedHaltCard,
  getHaltWidgetState,
  haltCompanyName,
  haltWatchers,
  haltWidgetBodyHtml,
  paintHaltWidget,
  patchHaltWidget,
  subscribeHaltWatchers,
  subscribeHaltWidget,
  type HaltWidgetCopy,
} from "@/lib/halts/halt-widget";

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

function liveSignature(cards: LiveHaltCard[]): string {
  return cards
    .map((row) => [row.ticker, row.haltedAt, row.resumedAt ?? "", row.kind, row.market].join("~"))
    .join("|");
}

export function HaltFloat() {
  const { t, locale } = useI18n();
  const snap = useSyncExternalStore(subscribeHaltWidget, getHaltWidgetState, getHaltWidgetState);
  const copy = useMemo<HaltWidgetCopy>(
    () => ({
      title: t("nav.halts"),
      until: t("halts.until"),
      resumed: t("halts.resumed"),
      unknown: t("halts.unknown"),
      waiting: t("halts.waiting"),
      empty: t("halts.empty"),
    }),
    [t],
  );
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const copyRef = useRef(copy);
  copyRef.current = copy;
  const modeRef = useRef(snap.mode);
  modeRef.current = snap.mode;
  const pipRef = useRef<Window | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const openingRef = useRef(false);
  const videoPendingRef = useRef(false);
  const paintRef = useRef<() => void>(() => undefined);
  const primeRef = useRef<() => void>(() => undefined);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const paintNow = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const now = Date.now();
    paintHaltWidget(ctx, focusedHaltCard(now), copyRef.current, now, localeRef.current);
    const stream = videoRef.current?.srcObject;
    if (stream instanceof MediaStream) {
      const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;
      try {
        track?.requestFrame();
      } catch {
        /* ignore */
      }
    }
    const pip = pipRef.current;
    if (pip && !pip.closed) {
      const scroller = pip.document.getElementById("halt-scroll");
      const card = focusedHaltCard(now);
      if (scroller) scroller.innerHTML = haltWidgetBodyHtml(card, copyRef.current, now, localeRef.current);
      const title = copyRef.current.title;
      pip.document.title = card ? `${card.ticker} · ${haltCompanyName(card, localeRef.current)}` : title;
    }
  }, []);
  paintRef.current = paintNow;

  const ensureStream = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    paintNow();
    if (!video.srcObject) video.srcObject = canvas.captureStream(0);
    paintNow();
  }, [paintNow]);

  const prime = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    ensureStream();
    video.muted = true;
    const play = video.play();
    if (play) void play.catch(() => undefined);
  }, [ensureStream]);
  primeRef.current = prime;

  const close = useCallback(() => {
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
    const pip = pipRef.current;
    if (pip && !pip.closed) {
      try {
        pip.close();
      } catch {
        /* ignore */
      }
    }
    pipRef.current = null;
    video?.pause();
    patchHaltWidget({ mode: "off" });
  }, []);

  const startVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video) return false;
    ensureStream();
    video.muted = true;
    const play = video.play();
    if (play) void play.catch(() => undefined);
    const webkit = video as WebkitVideo;
    const enterWebkit = () => {
      if (!webkit.webkitSetPresentationMode || !webkit.webkitSupportsPresentationMode?.("picture-in-picture")) return false;
      try {
        webkit.webkitSetPresentationMode("picture-in-picture");
      } catch {
        return false;
      }
      return webkit.webkitPresentationMode === "picture-in-picture";
    };
    const failToPanel = () => {
      videoPendingRef.current = false;
      if (document.pictureInPictureElement === video || enterWebkit()) patchHaltWidget({ mode: "video" });
      else if (getHaltWidgetState().mode !== "document") patchHaltWidget({ mode: "panel" });
    };
    if (typeof video.requestPictureInPicture === "function") {
      videoPendingRef.current = true;
      void video.requestPictureInPicture()
        .then(() => {
          videoPendingRef.current = false;
          patchHaltWidget({ mode: "video" });
        })
        .catch((error: unknown) => {
          const notReady = error instanceof DOMException && error.name === "InvalidStateError";
          if (!notReady) {
            failToPanel();
            return;
          }
          let settled = false;
          const retry = () => {
            if (settled || getHaltWidgetState().mode !== "off") return;
            settled = true;
            window.clearTimeout(giveUp);
            void video.requestPictureInPicture().then(() => {
              videoPendingRef.current = false;
              patchHaltWidget({ mode: "video" });
            }).catch(() => failToPanel());
          };
          const giveUp = window.setTimeout(() => {
            if (settled || getHaltWidgetState().mode !== "off") return;
            settled = true;
            video.removeEventListener("loadeddata", retry);
            failToPanel();
          }, 1200);
          video.addEventListener("loadeddata", retry, { once: true });
        });
      return true;
    }
    if (enterWebkit()) {
      patchHaltWidget({ mode: "video" });
      return true;
    }
    return false;
  }, [ensureStream]);

  const openDocument = useCallback(() => {
    const api = pipApi();
    if (!api) return false;
    openingRef.current = true;
    void api.requestWindow({ width: 440, height: 320 }).then((pip) => {
      openingRef.current = false;
      pipRef.current = pip;
      pip.document.body.style.margin = "0";
      pip.document.body.style.background = "#fff";
      const scroll = pip.document.createElement("div");
      scroll.id = "halt-scroll";
      pip.document.body.appendChild(scroll);
      paintNow();
      pip.addEventListener("pagehide", () => {
        if (pipRef.current === pip) pipRef.current = null;
        if (modeRef.current === "document") patchHaltWidget({ mode: "off" });
      });
      patchHaltWidget({ mode: "document" });
    }).catch(() => {
      openingRef.current = false;
      if (getHaltWidgetState().mode === "off") patchHaltWidget({ mode: "panel" });
    });
    return true;
  }, [paintNow]);

  const open = useCallback(() => {
    if (openingRef.current || videoPendingRef.current || modeRef.current !== "off") return;
    if (startVideo()) return;
    if (openDocument()) return;
    patchHaltWidget({ mode: "panel" });
  }, [openDocument, startVideo]);

  useEffect(() => bindHaltWidgetControls({ open, close, prime }), [open, close, prime]);

  useEffect(() => {
    void ensureKoreanShareNames();
    return subscribeKoreanShareNames(() => setNowMs(Date.now()));
  }, []);

  useEffect(() => {
    const video = document.createElement("video");
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.controls = false;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.setAttribute("muted", "");
    video.width = HALT_PIP_W;
    video.height = HALT_PIP_H;
    video.setAttribute("aria-hidden", "true");
    video.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;";
    document.body.appendChild(video);
    videoRef.current = video;
    const canvas = document.createElement("canvas");
    canvas.width = HALT_PIP_W;
    canvas.height = HALT_PIP_H;
    canvas.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;";
    document.body.appendChild(canvas);
    canvasRef.current = canvas;
    const onEnter = () => {
      videoPendingRef.current = false;
      patchHaltWidget({ mode: "video" });
    };
    const onLeave = () => {
      videoPendingRef.current = false;
      if (modeRef.current === "video") patchHaltWidget({ mode: "off" });
      video.pause();
    };
    video.addEventListener("enterpictureinpicture", onEnter);
    video.addEventListener("leavepictureinpicture", onLeave);
    primeRef.current();
    const clock = window.setInterval(() => {
      if (modeRef.current === "off") return;
      paintRef.current();
    }, 250);
    return () => {
      window.clearInterval(clock);
      video.removeEventListener("enterpictureinpicture", onEnter);
      video.removeEventListener("leavepictureinpicture", onLeave);
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
    };
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer = 0;
    const tick = async () => {
      const floating = modeRef.current !== "off";
      if (!floating && haltWatchers() === 0) return;
      if (document.hidden && !floating) return;
      try {
        const res = await fetch(haltLiveUrl(), { cache: "no-cache" });
        if (stopped) return;
        if (res.status === 304) return;
        if (!res.ok) {
          if (getHaltWidgetState().live == null) patchHaltWidget({ live: [] });
          return;
        }
        const json = (await res.json()) as { cards?: LiveHaltCard[] };
        if (!Array.isArray(json.cards)) {
          if (getHaltWidgetState().live == null) patchHaltWidget({ live: [] });
          return;
        }
        const prev = getHaltWidgetState().live;
        if (prev && liveSignature(prev) === liveSignature(json.cards)) return;
        patchHaltWidget({ live: json.cards });
      } catch {
        if (!stopped && getHaltWidgetState().live == null) patchHaltWidget({ live: [] });
      }
    };
    const arm = () => {
      window.clearInterval(timer);
      if (stopped) return;
      if (modeRef.current === "off" && haltWatchers() === 0) return;
      void tick();
      timer = window.setInterval(() => void tick(), 1000);
    };
    arm();
    const unsub = subscribeHaltWatchers(arm);
    const onVisible = () => {
      if (!document.hidden || modeRef.current !== "off") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    const onMode = () => {
      const next = getHaltWidgetState().mode;
      if (next !== "off" && modeRef.current === "off") arm();
    };
    const unsubMode = subscribeHaltWidget(onMode);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      unsub();
      unsubMode();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    if (snap.mode !== "panel") return;
    const id = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [snap.mode]);

  if (snap.mode !== "panel") return null;
  const card = focusedHaltCard(nowMs);
  const face = card ? haltCardFace(card, nowMs) : null;
  return (
    <div
      role="dialog"
      aria-label={copy.title}
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-[80] w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-neutral-300 bg-white p-4 shadow-xl"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-neutral-950">{copy.title}</p>
        <button type="button" className="text-xs font-medium text-neutral-950" onClick={close}>
          {t("halts.floatClose")}
        </button>
      </div>
      {card && face ? (
        <div className="mt-3">
          <p className="font-mono text-2xl font-bold text-neutral-950">{card.ticker}</p>
          <p className="mt-1 text-sm text-neutral-700">{haltCompanyName(card, locale)}</p>
          {face.resumed ? (
            <p className="mt-4 text-center text-5xl font-bold text-green-700">{copy.resumed}</p>
          ) : face.timed ? (
            <>
              <p className="mt-4 text-center text-sm text-neutral-600">{copy.until}</p>
              <p className="text-center font-mono text-6xl font-bold tabular-nums text-neutral-950">{face.countdown}</p>
            </>
          ) : (
            <>
              <p className="mt-4 text-center text-sm text-neutral-600">{copy.waiting}</p>
              <p className="text-center text-5xl font-bold text-neutral-950">{copy.unknown}</p>
            </>
          )}
        </div>
      ) : (
        <p className="mt-4 text-sm text-neutral-700">{copy.empty}</p>
      )}
    </div>
  );
}
