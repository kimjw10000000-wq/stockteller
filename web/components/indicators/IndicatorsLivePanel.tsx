"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Radio } from "lucide-react";
import type {
  IndicatorCardState,
  IndicatorCompareStatus,
  IndicatorsSnapshot,
} from "@/lib/indicators/types";
import { ProtectedContent } from "@/components/security/ProtectedContent";
import { useI18n } from "@/components/i18n/I18nProvider";

const FALLBACK_POLL_MS = 2_000;
const SCRAPE_LEAD_MS = 12_000;

function statusColor(status: IndicatorCompareStatus): {
  text: string;
  bg: string;
  ring: string;
} {
  switch (status) {
    case "HIGHER":
      return { text: "text-[#FF3B30]", bg: "bg-[#FF3B30]/10", ring: "ring-[#FF3B30]/40" };
    case "LOWER":
      return { text: "text-[#34C759]", bg: "bg-[#34C759]/10", ring: "ring-[#34C759]/40" };
    case "EQUAL":
      return { text: "text-[#B45309]", bg: "bg-[#FFCC00]/25", ring: "ring-[#FFCC00]/50" };
    default:
      return { text: "text-neutral-950", bg: "bg-neutral-100", ring: "ring-neutral-200" };
  }
}

function formatPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function countdownLabel(nextReleaseAt: string | null, nowMs: number): string | null {
  if (!nextReleaseAt) return null;
  const t = Date.parse(nextReleaseAt);
  if (!Number.isFinite(t)) return null;
  const diff = t - nowMs;
  if (diff <= 0) return "발표 구간";
  const sec = Math.ceil(diff / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}시간 ${m % 60}분 후`;
  }
  return `${m}분 ${String(s).padStart(2, "0")}초 후`;
}

function IndicatorCard({
  item,
  nowMs,
  flash,
}: {
  item: IndicatorCardState;
  nowMs: number;
  flash: boolean;
}) {
  const colors = statusColor(item.status);
  const cd = countdownLabel(item.nextReleaseAt, nowMs);
  const pending = item.actual == null;

  return (
    <article
      className={`relative overflow-hidden rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition-shadow duration-300 sm:p-6 ${
        flash ? `ring-2 ${colors.ring} shadow-md` : ""
      }`}
    >
      {flash ? (
        <span
          className={`pointer-events-none absolute inset-0 animate-pulse ${colors.bg}`}
          aria-hidden
        />
      ) : null}

      <div className="relative">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-neutral-950">
              {item.indicator}
            </h2>
            <p className="mt-0.5 text-xs text-neutral-950">{item.label}</p>
          </div>
          {item.scraping ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              BLS 수신 중
            </span>
          ) : null}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-neutral-50 px-3 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-950">
              예측 (Consensus)
            </p>
            <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-neutral-900">
              {formatPct(item.forecast)}
            </p>
          </div>

          <div className={`rounded-xl px-3 py-4 ${colors.bg}`}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-950">
              실제 (Actual)
            </p>
            {pending ? (
              <div className="mt-2 flex items-center gap-2">
                <Loader2 className={`h-5 w-5 animate-spin ${colors.text}`} aria-hidden />
                <span className="text-sm font-medium text-neutral-950">발표 대기 중…</span>
              </div>
            ) : (
              <p className={`mt-2 font-mono text-2xl font-bold tabular-nums ${colors.text}`}>
                {formatPct(item.actual)}
              </p>
            )}
            {!pending && item.period && item.period !== "unknown" ? (
              <p className="mt-1 text-[10px] font-medium uppercase text-neutral-950">
                {item.observationPeriod ? `${item.observationPeriod} · ` : ""}
                {item.period === "mom" ? "전월 대비" : "전년 대비"}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-950">
          <span>{cd ? `다음 발표 ${cd}` : "다음 발표 일정 미설정"}</span>
          {item.releasedAt ? (
            <span className="tabular-nums">
              반영 {new Date(item.releasedAt).toLocaleTimeString()}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function IndicatorsLivePanel() {
  const { t } = useI18n();
  const [items, setItems] = useState<IndicatorCardState[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [flashIds, setFlashIds] = useState<Record<string, number>>({});
  const [mockBusy, setMockBusy] = useState(false);
  const scrapeArmed = useRef<Record<string, boolean>>({});
  const catchUpArmed = useRef(false);
  const allowMock = process.env.NODE_ENV !== "production";

  const applySnapshot = useCallback((snap: IndicatorsSnapshot) => {
    setItems(snap.items);
  }, []);

  const flash = useCallback((id: string) => {
    const token = Date.now();
    setFlashIds((prev) => ({ ...prev, [id]: token }));
    window.setTimeout(() => {
      setFlashIds((prev) => {
        if (prev[id] !== token) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }, 1600);
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    let es: EventSource | null = null;
    let pollTimer: number | null = null;
    let cancelled = false;

    async function loadState() {
      try {
        const res = await fetch("/api/indicators/state", { cache: "no-store" });
        const j = (await res.json()) as IndicatorsSnapshot & { ok?: boolean };
        if (!cancelled && j.items) applySnapshot(j);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    }

    void loadState();

    try {
      es = new EventSource("/api/indicators/stream");
      es.addEventListener("open", () => setConnected(true));
      es.addEventListener("error", () => setConnected(false));
      es.addEventListener("snapshot", (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data) as IndicatorsSnapshot;
          applySnapshot(data);
        } catch {
          /* ignore */
        }
      });
      es.addEventListener("indicator", (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data) as IndicatorCardState;
          flash(data.indicator);
          setItems((prev) => {
            const map = new Map(prev.map((x) => [x.indicator, x]));
            const cur = map.get(data.indicator);
            map.set(data.indicator, {
              ...(cur ?? {
                label: data.indicator,
                nextReleaseAt: null,
                scraping: false,
                sourceUrl: data.sourceUrl,
              }),
              ...data,
            });
            return Array.from(map.values()).sort((a, b) =>
              a.indicator.localeCompare(b.indicator)
            );
          });
        } catch {
          /* ignore */
        }
      });
    } catch {
      setConnected(false);
    }

    // Fallback short poll: fast while awaiting / scraping, slower otherwise
    pollTimer = window.setInterval(() => {
      void (async () => {
        try {
          const res = await fetch("/api/indicators/state", { cache: "no-store" });
          const j = (await res.json()) as IndicatorsSnapshot;
          if (j.items) {
            setItems((prev) => {
              for (const next of j.items) {
                const old = prev.find((p) => p.indicator === next.indicator);
                if (old && old.actual == null && next.actual != null) {
                  flash(next.indicator);
                }
              }
              return j.items;
            });
          }
        } catch {
          /* ignore */
        }
      })();
    }, FALLBACK_POLL_MS);

    return () => {
      cancelled = true;
      es?.close();
      if (pollTimer != null) window.clearInterval(pollTimer);
    };
  }, [applySnapshot, flash]);

  // Auto-wake BLS scrape ~12s before scheduled release, or once if actual is still empty
  useEffect(() => {
    for (const item of items) {
      if (!item.nextReleaseAt || item.actual != null) continue;
      const t = Date.parse(item.nextReleaseAt);
      if (!Number.isFinite(t)) continue;
      const until = t - nowMs;
      if (until <= SCRAPE_LEAD_MS && until >= -60_000 && !scrapeArmed.current[item.indicator]) {
        scrapeArmed.current[item.indicator] = true;
        void fetch("/api/indicators/scrape", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ indicator: item.indicator, durationMs: 120_000 }),
        });
      }
    }

    if (
      items.length &&
      items.some((item) => item.actual == null) &&
      !catchUpArmed.current
    ) {
      catchUpArmed.current = true;
      void fetch("/api/indicators/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ indicator: "ALL", durationMs: 20_000 }),
      });
    }
  }, [items, nowMs]);

  const subtitle = useMemo(() => {
    if (connected) return "SSE 연결됨 · 발표 즉시 자동 갱신";
    return "폴링 모드 · 0.2초 간격 동기화";
  }, [connected]);

  async function fireMock(indicator: "CPI" | "PPI", actual: number) {
    setMockBusy(true);
    try {
      await fetch("/api/indicators/mock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ indicator, actual, period: "mom" }),
      });
    } finally {
      setMockBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="border-b border-neutral-200 pb-5">
        <p className="text-xs font-medium uppercase tracking-wider text-neutral-950">
          US Macro · BLS
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-950 sm:text-3xl">
          {t("indicators.title")}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-950">
          {t("indicators.lead")}
        </p>
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-neutral-950">
          <Radio className={`h-3.5 w-3.5 ${connected ? "text-emerald-600" : "text-neutral-800"}`} />
          {subtitle}
        </p>
      </header>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <ProtectedContent className="grid gap-4 sm:grid-cols-2">
        {(items.length ? items : [
          {
            indicator: "CPI" as const,
            label: "CPI (소비자물가지수)",
            actual: null,
            forecast: null,
            status: "PENDING" as const,
            releasedAt: null,
            sourceUrl: "",
            nextReleaseAt: null,
            scraping: false,
          },
          {
            indicator: "PPI" as const,
            label: "PPI (생산자물가지수)",
            actual: null,
            forecast: null,
            status: "PENDING" as const,
            releasedAt: null,
            sourceUrl: "",
            nextReleaseAt: null,
            scraping: false,
          },
        ]).map((item) => (
          <IndicatorCard
            key={item.indicator}
            item={item}
            nowMs={nowMs}
            flash={Boolean(flashIds[item.indicator])}
          />
        ))}
      </ProtectedContent>

      <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-[11px] leading-relaxed text-neutral-950">
        <p>
          색상: 실제 &gt; 예측 <span className="font-semibold text-[#FF3B30]">빨강</span> · 실제
          &lt; 예측 <span className="font-semibold text-[#34C759]">초록</span> · 동일{" "}
          <span className="font-semibold text-[#B45309]">노랑</span>
        </p>
        <p className="mt-1">
          예측치는 환경변수 <code className="rounded bg-white px-1">INDICATOR_CPI_FORECAST</code> /{" "}
          <code className="rounded bg-white px-1">INDICATOR_PPI_FORECAST</code> 또는{" "}
          <code className="rounded bg-white px-1">/api/indicators/forecast</code> 로 설정합니다.
        </p>
      </div>

      {allowMock ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={mockBusy}
            onClick={() => void fireMock("CPI", 3.2)}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-neutral-50 disabled:opacity-50"
          >
            Mock CPI 3.2%
          </button>
          <button
            type="button"
            disabled={mockBusy}
            onClick={() => void fireMock("CPI", 2.9)}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-neutral-50 disabled:opacity-50"
          >
            Mock CPI 2.9%
          </button>
          <button
            type="button"
            disabled={mockBusy}
            onClick={() => void fireMock("PPI", 0.2)}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-neutral-50 disabled:opacity-50"
          >
            Mock PPI 0.2%
          </button>
        </div>
      ) : null}
    </div>
  );
}
