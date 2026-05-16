"use client";

import { useCallback, useRef, useState } from "react";
import type { VolatileRow } from "@/lib/volatile-row";

type InsightOk = {
  status: "ok";
  bull: { title: string; summary_lines: string[] };
  bear: { title: string; summary_lines: string[] };
  overall: "positive" | "negative" | "neutral";
  filingDate: string;
  accessionNumber: string;
  secViewerUrl?: string;
};

type InsightState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | InsightOk;

type ModalState = { side: "bull" | "bear" } | null;

function InsightModal({
  open,
  onClose,
  side,
  state,
}: {
  open: boolean;
  onClose: () => void;
  side: "bull" | "bear";
  state: InsightState;
}) {
  if (!open) return null;

  const titleLabel = side === "bull" ? "호재 관점" : "악재 관점";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal
      aria-labelledby="insight-modal-title"
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`sticky top-0 flex items-center justify-between border-b px-4 py-3 ${
            side === "bull" ? "border-rose-100 bg-rose-50/90" : "border-slate-200 bg-slate-50/90"
          }`}
        >
          <h2 id="insight-modal-title" className="text-base font-bold text-slate-900">
            {titleLabel}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-white/80 hover:text-slate-800"
          >
            닫기
          </button>
        </div>

        <div className="px-4 py-4 text-sm text-slate-700">
          {state.status === "loading" ? (
            <p className="text-slate-500">SEC 최근 8-K를 불러오고 Gemini로 요약 중입니다…</p>
          ) : state.status === "error" ? (
            <p className="text-amber-800" role="alert">
              {state.message}
            </p>
          ) : state.status === "idle" ? (
            <p className="text-slate-500">잠시만 기다려 주세요.</p>
          ) : (
            <>
              <p className="text-xs text-slate-400">
                최근 8-K 제출일 {state.filingDate} · AI 요약 (투자 참고용, 법적 자문 아님)
                {state.secViewerUrl ? (
                  <>
                    {" · "}
                    <a
                      href={state.secViewerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-[#3182f6] underline hover:text-[#1b64da]"
                    >
                      SEC 원문 보기
                    </a>
                  </>
                ) : null}
              </p>
              <h3 className="mt-2 text-base font-semibold text-slate-900">
                {side === "bull" ? state.bull.title : state.bear.title}
              </h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-pretty leading-relaxed">
                {(side === "bull" ? state.bull.summary_lines : state.bear.summary_lines).map(
                  (line, i) => (
                    <li key={i}>{line}</li>
                  )
                )}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function UsMoverRow({ r }: { r: VolatileRow }) {
  const pct = r.change_pct != null ? Number(r.change_pct) : null;
  const pctLabel = pct == null ? "—" : `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
  const pctClass =
    pct == null ? "text-slate-400" : pct >= 0 ? "font-semibold text-rose-600" : "font-medium text-blue-600";

  const [insight, setInsight] = useState<InsightState>({ status: "idle" });
  const insightRef = useRef<InsightState>(insight);
  insightRef.current = insight;
  const loadingFlight = useRef(false);

  const [modal, setModal] = useState<ModalState>(null);

  const ensureLoaded = useCallback(async () => {
    if (insightRef.current.status === "ok") return;
    if (loadingFlight.current) return;
    loadingFlight.current = true;

    setInsight({ status: "loading" });
    try {
      const res = await fetch("/api/us-mover-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: r.ticker }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        analysis?: {
          bull_case: { title: string; summary_lines: string[] };
          bear_case: { title: string; summary_lines: string[] };
          overall_sentiment: string;
        };
        filing?: {
          filingDate?: string;
          accessionNumber?: string;
          secViewerUrl?: string;
        };
      };

      if (!res.ok || !j.ok || !j.analysis) {
        setInsight({
          status: "error",
          message: j.error ?? `요청 실패 (${res.status})`,
        });
        return;
      }

      setInsight({
        status: "ok",
        bull: {
          title: j.analysis.bull_case.title,
          summary_lines: j.analysis.bull_case.summary_lines,
        },
        bear: {
          title: j.analysis.bear_case.title,
          summary_lines: j.analysis.bear_case.summary_lines,
        },
        overall: (["positive", "negative", "neutral"].includes(j.analysis.overall_sentiment)
          ? j.analysis.overall_sentiment
          : "neutral") as InsightOk["overall"],
        filingDate: j.filing?.filingDate ?? "—",
        accessionNumber: j.filing?.accessionNumber ?? "",
        secViewerUrl: j.filing?.secViewerUrl,
      });
    } catch (e) {
      setInsight({
        status: "error",
        message: e instanceof Error ? e.message : "네트워크 오류",
      });
    } finally {
      loadingFlight.current = false;
    }
  }, [r.ticker]);

  const openSide = useCallback(
    (side: "bull" | "bear") => {
      setModal({ side });
      void ensureLoaded();
    },
    [ensureLoaded]
  );

  const overall = insight.status === "ok" ? insight.overall : null;

  return (
    <li className="border-b border-inherit px-3 py-2.5 text-sm last:border-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-mono font-semibold text-slate-900">{r.ticker}</span>
        <span className="text-xs text-slate-500">{r.currency}</span>
        <span className={pctClass}>{pctLabel}</span>
      </div>
      {r.name ? (
        <p className="mt-1 line-clamp-2 text-left text-xs leading-snug text-slate-600">{r.name}</p>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => openSide("bull")}
          className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
            overall === "positive"
              ? "bg-rose-600 text-white shadow-sm ring-2 ring-rose-300"
              : "border border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100"
          }`}
        >
          호재
        </button>
        <button
          type="button"
          onClick={() => openSide("bear")}
          className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
            overall === "negative"
              ? "bg-slate-700 text-white shadow-sm ring-2 ring-slate-400"
              : "border border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-100"
          }`}
        >
          악재
        </button>
        {insight.status === "loading" ? (
          <span className="text-xs text-slate-400">분석 중…</span>
        ) : insight.status === "error" && !modal ? (
          <span className="max-w-[12rem] truncate text-xs text-amber-700" title={insight.message}>
            {insight.message}
          </span>
        ) : null}
      </div>

      <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
        {r.last_price != null ? <span>가격 {Number(r.last_price).toLocaleString()}</span> : null}
        {r.volume != null ? <span>거래량 {Number(r.volume).toLocaleString()}</span> : null}
        <span className="ml-auto text-slate-400">{r.source}</span>
      </div>

      <InsightModal
        open={modal != null}
        onClose={() => setModal(null)}
        side={modal?.side ?? "bull"}
        state={modal ? insight : { status: "idle" }}
      />
    </li>
  );
}
