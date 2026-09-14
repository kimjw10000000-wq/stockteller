"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/components/i18n/I18nProvider";

type ChartPoint = { t: number; v: number; x: number };
type RangeKey = "1d" | "1w" | "1m" | "3m";

type Payload = {
  index?: number;
  series?: ChartPoint[];
  range?: RangeKey;
  axisStart?: number;
  axisEnd?: number;
  error?: string;
};

const POLL_MS: Record<RangeKey, number> = {
  "1d": 5_000,
  "1w": 20_000,
  "1m": 30_000,
  "3m": 60_000,
};
const CHART_W = 640;
const CHART_H = 280;
const PAD = 16;
const RANGES: RangeKey[] = ["1d", "1w", "1m", "3m"];

function roundIndex(n: number): string {
  if (!Number.isFinite(n)) return "0.00";
  return (Math.round(n * 100) / 100).toFixed(2);
}

function localClock(ms: number, locale: string): string {
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(ms));
}

function localDateTime(ms: number, locale: string): string {
  const loc = locale === "ko" ? "ko-KR" : "en-US";
  return new Intl.DateTimeFormat(loc, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(ms));
}

function hoverLabel(ms: number, range: RangeKey, locale: string): string {
  if (range === "1d") return localClock(ms, locale);
  if (range === "1w") return localDateTime(ms, locale);
  return axisLabel(ms, range, locale);
}

function axisLabel(ms: number, range: RangeKey, locale: string): string {
  const loc = locale === "ko" ? "ko-KR" : "en-US";
  if (range === "1d") {
    return new Intl.DateTimeFormat(loc, {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(ms));
  }
  return new Intl.DateTimeFormat(loc, { month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

function pointerToX(clientX: number, rect: DOMRect): number {
  const x = ((clientX - rect.left) / Math.max(rect.width, 1)) * CHART_W;
  const inner = CHART_W - PAD * 2;
  return Math.max(0, Math.min(1, (x - PAD) / inner));
}

function nearestIndex(series: ChartPoint[], x: number): number {
  if (series.length === 0) return 0;
  let best = 0;
  let dist = Infinity;
  for (let i = 0; i < series.length; i++) {
    const d = Math.abs(series[i].x - x);
    if (d < dist) {
      dist = d;
      best = i;
    }
  }
  const last = series[series.length - 1];
  if (x > last.x) return series.length - 1;
  if (x < series[0].x) return 0;
  return best;
}

function WashoutLineChart({
  series,
  range,
  axisStart,
  axisEnd,
  hoverIndex,
  onHoverIndex,
}: {
  series: ChartPoint[];
  range: RangeKey;
  axisStart: number;
  axisEnd: number;
  hoverIndex: number | null;
  onHoverIndex: (index: number | null) => void;
}) {
  const { locale } = useI18n();
  const wrapRef = useRef<HTMLDivElement>(null);
  const { line, area, up, pts } = useMemo(() => {
    if (series.length === 0) {
      return { line: "", area: "", up: true, pts: [] as Array<{ x: number; y: number }> };
    }
    const vals = series.map((p) => p.v);
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const span = maxV - minV || 1;
    const inner = CHART_W - PAD * 2;
    const nextPts = series.map((p) => {
      const x = PAD + p.x * inner;
      const y = PAD + ((maxV - p.v) / span) * (CHART_H - PAD * 2);
      return { x, y };
    });
    const linePath = nextPts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
    const last = nextPts[nextPts.length - 1];
    const areaPath = `${linePath} L ${last.x} ${CHART_H - PAD} L ${nextPts[0].x} ${CHART_H - PAD} Z`;
    const lastV = series[series.length - 1].v;
    const firstV = series[0].v;
    return {
      line: linePath,
      area: areaPath,
      up: lastV >= firstV,
      pts: nextPts,
    };
  }, [series]);

  const pick = useCallback(
    (clientX: number) => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect || series.length === 0) return;
      onHoverIndex(nearestIndex(series, pointerToX(clientX, rect)));
    },
    [onHoverIndex, series]
  );

  const stroke = up ? "#22c55e" : "#ef4444";
  const fill = up ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)";
  const hoverPt =
    hoverIndex != null && pts[hoverIndex] && series[hoverIndex]
      ? { ...pts[hoverIndex], point: series[hoverIndex] }
      : null;
  const startLabel = axisStart ? axisLabel(axisStart, range, locale) : "";
  const endLabel = axisEnd ? axisLabel(axisEnd, range, locale) : "";

  return (
    <div className="overflow-hidden">
      <div
        ref={wrapRef}
        className="relative cursor-crosshair touch-none"
        onPointerDown={(e) => {
          wrapRef.current?.setPointerCapture(e.pointerId);
          pick(e.clientX);
        }}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerUp={() => onHoverIndex(null)}
        onPointerCancel={() => onHoverIndex(null)}
        onPointerLeave={() => onHoverIndex(null)}
      >
        <svg
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          className="h-auto w-full"
          role="img"
          aria-label="설거지 지수 차트"
        >
          <rect width={CHART_W} height={CHART_H} fill="transparent" />
          {area ? <path d={area} fill={fill} /> : null}
          {line ? (
            <path
              d={line}
              fill="none"
              stroke={stroke}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}
          {hoverPt ? (
            <>
              <line
                x1={hoverPt.x}
                x2={hoverPt.x}
                y1={PAD}
                y2={CHART_H - PAD}
                stroke="#717182"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <circle cx={hoverPt.x} cy={hoverPt.y} r="4.5" fill="#ffffff" stroke={stroke} strokeWidth="2" />
            </>
          ) : null}
        </svg>
        {hoverPt ? (
          <div
            className="pointer-events-none absolute top-2 z-10 -translate-x-1/2 rounded-lg border border-border bg-card px-2.5 py-1.5 shadow-md"
            style={{
              left: `${Math.min(88, Math.max(12, (hoverPt.x / CHART_W) * 100))}%`,
            }}
          >
            <p className="text-[11px] tabular-nums text-muted-foreground">
              {hoverLabel(hoverPt.point.t, range, locale)}
            </p>
            <p className="text-sm font-semibold tabular-nums text-foreground">
              {roundIndex(hoverPt.point.v)}
            </p>
          </div>
        ) : null}
      </div>
      {startLabel && endLabel ? (
        <div className="flex justify-between border-t border-border px-1 pt-2 text-[11px] text-muted-foreground">
          <span>{startLabel}</span>
          <span>{endLabel}</span>
        </div>
      ) : (
        <div className="h-[18px] border-t border-border" />
      )}
    </div>
  );
}

export function SimilarMoversContent() {
  const { t, locale } = useI18n();
  const [range, setRange] = useState<RangeKey>("1d");
  const [data, setData] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const readyRef = useRef(false);
  const bootRef = useRef(true);
  const byRangeRef = useRef<Partial<Record<RangeKey, Payload>>>({});
  const histPrefetchRef = useRef(false);

  const rangeRef = useRef<RangeKey>(range);
  rangeRef.current = range;

  useEffect(() => {
    let cancelled = false;
    const loadDay = async () => {
      try {
        const params = new URLSearchParams({ range: "1d", _: String(Date.now()) });
        if (bootRef.current) {
          params.set("force", "1");
          bootRef.current = false;
        }
        const res = await fetch(`/api/washout?${params.toString()}`, { cache: "no-store" });
        const json = (await res.json()) as Payload;
        if (cancelled) return;
        const usable = json.series && json.series.length > 0;
        if ((res.ok && json.error == null) || usable) {
          readyRef.current = true;
          byRangeRef.current["1d"] = json;
          if (rangeRef.current === "1d") {
            setData(json);
            setFailed(false);
          }
          return;
        }
        if (!readyRef.current && rangeRef.current === "1d") setFailed(true);
      } catch {
        if (!cancelled && !readyRef.current && rangeRef.current === "1d" && !byRangeRef.current["3m"]?.series?.length) {
          setFailed(true);
        }
      }
    };
    const prefetchHist = () => {
      if (histPrefetchRef.current) return;
      histPrefetchRef.current = true;
      for (const key of ["1w", "1m", "3m"] as RangeKey[]) {
        void fetch(`/api/washout?range=${key}`, { cache: "no-store" })
          .then((res) => res.json() as Promise<Payload>)
          .then((hist) => {
            if (hist.error == null && hist.range) {
              byRangeRef.current[hist.range] = hist;
              if (rangeRef.current === hist.range) {
                setData(hist);
                setFailed(false);
              }
            }
          })
          .catch(() => undefined);
      }
    };
    prefetchHist();
    void loadDay();
    const id = window.setInterval(loadDay, POLL_MS["1d"]);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    setHoverIndex(null);
    const cached = byRangeRef.current[range];
    if (cached) setData(cached);
    if (range === "1d") return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/washout?range=${range}`, { cache: "no-store" });
        const json = (await res.json()) as Payload;
        if (cancelled) return;
        if (res.ok && json.error == null) {
          if (json.range) byRangeRef.current[json.range] = json;
          if (rangeRef.current === range) {
            setData(json);
            setFailed(false);
          }
        }
      } catch {
        /* 1일 폴이 살아 있으면 화면은 유지 */
      }
    };
    void load();
    const id = window.setInterval(load, POLL_MS[range]);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [range]);

  const chart = data?.range === range ? data : null;
  const series = (chart?.series ?? []).filter((p) => Number.isFinite(p.x));
  const hoverPoint =
    hoverIndex != null && hoverIndex < series.length ? series[hoverIndex] : null;
  const shown = hoverPoint?.v ?? data?.index;
  const shownTime = hoverPoint ? hoverLabel(hoverPoint.t, range, locale) : null;

  return (
    <main className="space-y-6">
      <header>
        <p className="text-sm font-medium text-muted-foreground">{t("similar.kicker")}</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground sm:text-3xl">
          {t("similar.title")}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {t("similar.lead")}
        </p>
      </header>

      <Card className="border-border">
        <CardContent className="px-6 py-6">
          {failed && !data ? (
            <p className="text-sm text-muted-foreground">{t("similar.error")}</p>
          ) : (
            <div className="space-y-5">
              <div>
                <p className="text-sm text-muted-foreground">{t("similar.indexLabel")}</p>
                <p className="mt-1 text-4xl font-semibold tabular-nums text-foreground sm:text-5xl">
                  {shown == null ? "—" : roundIndex(shown)}
                </p>
                <p className="mt-1 h-5 text-sm tabular-nums text-muted-foreground">
                  {shownTime ?? "\u00a0"}
                </p>
              </div>
              <WashoutLineChart
                series={series}
                range={range}
                axisStart={chart?.axisStart ?? 0}
                axisEnd={chart?.axisEnd ?? 0}
                hoverIndex={hoverIndex}
                onHoverIndex={setHoverIndex}
              />
              <div className="grid grid-cols-4 gap-1 text-center text-sm">
                {RANGES.map((key) => {
                  const active = range === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setRange(key)}
                      className={`rounded-lg py-2 ${
                        active
                          ? "bg-input-background font-medium text-foreground"
                          : "text-muted-foreground hover:bg-input-background/70"
                      }`}
                    >
                      {t(`similar.range.${key}`)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
