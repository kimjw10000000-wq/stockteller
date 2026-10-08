"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/components/i18n/I18nProvider";
import { activeTapeSession, type UsTradingSession } from "@/lib/us-market/us-session";
import { washoutChartUrl } from "@/lib/us-market/washout-chart-url";

type ChartPoint = { t: number; v: number; x: number };
type RangeKey = "1d" | "1w" | "1m" | "3m";
type SessionKey = UsTradingSession;
type OverlayKey = "yesterday" | "avg5" | "avg20";

type Compare = {
  yesterday?: number | null;
  avg5?: number | null;
  avg20?: number | null;
  at?: number;
  paths?: Partial<Record<OverlayKey, ChartPoint[]>>;
};

type Payload = {
  index?: number;
  series?: ChartPoint[];
  range?: RangeKey;
  session?: SessionKey;
  axisStart?: number;
  axisEnd?: number;
  compare?: Compare;
  reaction?: {
    index?: number;
    series?: ChartPoint[];
    compare?: Compare;
  };
  error?: string;
};

type Member = { ticker: string; score: number };
type Members = {
  session: SessionKey | null;
  index: Member[];
  reaction: Member[];
};

type ChartFile = {
  boards?: Partial<Record<string, Payload>>;
  members?: Members;
};

const CHART_W = 640;
const CHART_H = 280;
const PAD = 16;
const RANGES: RangeKey[] = ["1d", "1w", "1m", "3m"];
const SESSIONS: SessionKey[] = ["afterhours", "premarket", "regular"];

function boardKey(range: RangeKey, session: SessionKey): string {
  return `${range}:${session}`;
}
const OVERLAYS: Array<{ key: OverlayKey; color: string }> = [
  { key: "yesterday", color: "#2563eb" },
  { key: "avg5", color: "#7c3aed" },
  { key: "avg20", color: "#d97706" },
];

function roundIndex(n: number): string {
  if (!Number.isFinite(n)) return "0.00";
  if (n === 0) return "0.00";
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

function nearestValue(series: ChartPoint[], x: number): number | null {
  if (series.length === 0) return null;
  return series[nearestIndex(series, x)]?.v ?? null;
}

function linePathOf(pts: Array<{ x: number; y: number }>): string {
  return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

function WashoutLineChart({
  series,
  range,
  axisStart,
  axisEnd,
  hoverIndex,
  onHoverIndex,
  overlays,
}: {
  series: ChartPoint[];
  range: RangeKey;
  axisStart: number;
  axisEnd: number;
  hoverIndex: number | null;
  onHoverIndex: (index: number | null) => void;
  overlays: Array<{ key: OverlayKey; color: string; label: string; points: ChartPoint[]; level: number | null }>;
}) {
  const { locale } = useI18n();
  const wrapRef = useRef<HTMLDivElement>(null);
  const { line, area, sinking, pts, overlayDrawn } = useMemo(() => {
    const overlayPts = overlays.flatMap((o) => o.points.map((p) => p.v));
    const overlayLevels = overlays.map((o) => o.level).filter((v): v is number => v != null);
    const vals = [...series.map((p) => p.v), ...overlayPts, ...overlayLevels];
    if (series.length === 0 && overlayPts.length === 0) {
      return {
        line: "",
        area: "",
        sinking: false,
        pts: [] as Array<{ x: number; y: number }>,
        overlayDrawn: [] as Array<{ key: OverlayKey; color: string; line: string; y: number | null }>,
      };
    }
    const maxV = Math.max(0, ...vals);
    const minV = Math.min(0, ...vals);
    const span = maxV - minV || 1;
    const inner = CHART_W - PAD * 2;
    const plotH = CHART_H - PAD * 2;
    const toY = (v: number) => PAD + ((maxV - v) / span) * plotH;
    const nextPts = series.map((p) => ({
      x: PAD + p.x * inner,
      y: toY(p.v),
    }));
    const linePath = nextPts.length ? linePathOf(nextPts) : "";
    const first = nextPts[0];
    const last = nextPts[nextPts.length - 1];
    const topY = toY(0);
    const areaPath =
      nextPts.length > 0
        ? `M ${first.x} ${topY} ${nextPts.map((p) => `L ${p.x} ${p.y}`).join(" ")} L ${last.x} ${topY} Z`
        : "";
    const lastV = series.at(-1)?.v ?? 0;
    const firstV = series[0]?.v ?? 0;
    return {
      line: linePath,
      area: areaPath,
      sinking: lastV < firstV,
      pts: nextPts,
      overlayDrawn: overlays.map((o) => {
        const pathOk = (range === "1d" || range === "1w") && o.points.length >= 2;
        return {
          key: o.key,
          color: o.color,
          line: pathOk
            ? linePathOf(o.points.map((p) => ({ x: PAD + p.x * inner, y: toY(p.v) })))
            : "",
          y: !pathOk && o.level != null ? toY(o.level) : null,
        };
      }),
    };
  }, [overlays, range, series]);

  const pick = useCallback(
    (clientX: number) => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect || series.length === 0) return;
      onHoverIndex(nearestIndex(series, pointerToX(clientX, rect)));
    },
    [onHoverIndex, series]
  );

  const stroke = sinking ? "#ef4444" : "#22c55e";
  const fill = sinking ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)";
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
          {overlayDrawn.map((o) =>
            o.line ? (
              <path
                key={o.key}
                d={o.line}
                fill="none"
                stroke={o.color}
                strokeWidth="1.75"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : o.y != null ? (
              <line
                key={o.key}
                x1={PAD}
                x2={CHART_W - PAD}
                y1={o.y}
                y2={o.y}
                stroke={o.color}
                strokeWidth="1.5"
              />
            ) : null
          )}
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
            {overlays.map((o) => {
              const v = nearestValue(o.points, hoverPt.point.x) ?? o.level;
              if (v == null) return null;
              return (
                <p key={o.key} className="text-[11px] tabular-nums" style={{ color: o.color }}>
                  {o.label} {roundIndex(v)}
                </p>
              );
            })}
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

function IndexPane({
  label,
  hint,
  chart,
  names,
  namesNote,
  range,
  session,
  onRange,
  onSession,
  overlaysOn,
  onToggleOverlay,
}: {
  label: string;
  hint?: string;
  chart: Payload | null;
  names: Member[] | null;
  namesNote?: string;
  range: RangeKey;
  session: SessionKey;
  onRange: (range: RangeKey) => void;
  onSession: (session: SessionKey) => void;
  overlaysOn: Record<OverlayKey, boolean>;
  onToggleOverlay: (key: OverlayKey) => void;
}) {
  const { t, locale } = useI18n();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  useEffect(() => {
    setHoverIndex(null);
  }, [range, session]);
  const series = (chart?.series ?? []).filter((p) => Number.isFinite(p.x));
  const hoverPoint = hoverIndex != null && hoverIndex < series.length ? series[hoverIndex] : null;
  const shown = hoverPoint?.v ?? series.at(-1)?.v ?? null;
  const lastT = hoverPoint?.t ?? series.at(-1)?.t;
  const shownTime = lastT != null ? hoverLabel(lastT, range, locale) : null;
  const compare = chart?.compare;
  const overlayRows = useMemo(
    () =>
      OVERLAYS.map((row) => ({
        ...row,
        label: t(
          row.key === "yesterday"
            ? "similar.compareYesterday"
            : row.key === "avg5"
              ? "similar.compareAvg5"
              : "similar.compareAvg20"
        ),
        value: compare?.[row.key] ?? null,
        points: (compare?.paths?.[row.key] ?? []).filter((p) => Number.isFinite(p.x)),
      })),
    [compare, t]
  );
  const activeOverlays = overlayRows
    .filter((row) => overlaysOn[row.key])
    .map((row) => ({
      key: row.key,
      color: row.color,
      label: row.label,
      points: row.points,
      level: row.value,
    }));

  return (
    <Card className="border-border">
      <CardContent className="px-4 py-4">
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-foreground">
                {shown == null ? "—" : roundIndex(shown)}
              </p>
              <p className="mt-1 h-5 text-sm tabular-nums text-muted-foreground">
                {shownTime ?? "\u00a0"}
              </p>
              {hint ? <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{hint}</p> : null}
            </div>
            <div className="flex shrink-0 rounded-lg border border-border p-0.5" role="group">
              {SESSIONS.map((key) => {
                const active = session === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onSession(key)}
                    className={`rounded-md px-2.5 py-1.5 text-xs sm:px-3 sm:text-sm ${
                      active
                        ? "bg-[#030213] font-semibold text-white shadow-sm"
                        : "text-muted-foreground hover:bg-black/5"
                    }`}
                  >
                    {t(`similar.session.${key}`)}
                  </button>
                );
              })}
            </div>
          </div>
          {names ? (
            <div className="border-t border-border pt-3">
              <p className="text-[11px] text-muted-foreground">{t("similar.members")}</p>
              {names.length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">{namesNote}</p>
              ) : (
                <ul className="mt-2 flex max-h-28 flex-wrap gap-x-4 gap-y-1 overflow-y-auto">
                  {names.map((name) => (
                    <li key={name.ticker} className="flex items-baseline gap-2 text-sm">
                      <span className="font-mono text-foreground">{name.ticker}</span>
                      <span className="tabular-nums text-foreground">{roundIndex(name.score)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
          <div>
            <p className="mb-2 text-[11px] text-muted-foreground">
              {compare?.at ? `${localClock(compare.at, locale)} ${t("similar.sameTime")}` : "\u00a0"}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {overlayRows.map((row) => {
                const active = overlaysOn[row.key];
                return (
                  <button
                    key={row.key}
                    type="button"
                    onClick={() => onToggleOverlay(row.key)}
                    className={`rounded-lg border px-2 py-2 text-left ${
                      active ? "bg-input-background" : "border-border hover:bg-input-background/70"
                    }`}
                    style={active ? { borderColor: row.color } : undefined}
                  >
                    <span className="block text-[11px] text-muted-foreground">{row.label}</span>
                    <span
                      className="mt-0.5 block text-sm font-medium tabular-nums"
                      style={{ color: active ? row.color : undefined }}
                    >
                      {row.value == null ? "—" : roundIndex(row.value)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <WashoutLineChart
            series={series}
            range={range}
            axisStart={chart?.axisStart ?? 0}
            axisEnd={chart?.axisEnd ?? 0}
            hoverIndex={hoverIndex}
            onHoverIndex={setHoverIndex}
            overlays={activeOverlays}
          />
          <div className="grid grid-cols-4 gap-1 text-center text-sm">
            {RANGES.map((key) => {
              const active = range === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onRange(key)}
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
      </CardContent>
    </Card>
  );
}

function memberList(raw: unknown): Member[] | null {
  if (!Array.isArray(raw)) return null;
  const out: Member[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const ticker = String((row as { ticker?: unknown }).ticker ?? "").trim().toUpperCase();
    const score = Number((row as { score?: unknown }).score);
    if (!ticker || !Number.isFinite(score)) continue;
    out.push({ ticker, score });
  }
  return out;
}

function readMembers(json: ChartFile | null | undefined): Members | null {
  const index = memberList(json?.members?.index);
  const reaction = memberList(json?.members?.reaction);
  if (!index || !reaction) return null;
  const session = json?.members?.session;
  const known = session === "afterhours" || session === "premarket" || session === "regular";
  return { session: known ? session : null, index, reaction };
}

function publishedFile(): ChartFile | null {
  if (typeof window === "undefined") return null;
  return (window as Window & { __washoutReady?: ChartFile }).__washoutReady ?? null;
}

export function SimilarMoversContent() {
  const { t } = useI18n();
  const [range, setRange] = useState<RangeKey>("1d");
  const [session, setSession] = useState<SessionKey>(() => activeTapeSession());
  const readyRef = useRef(false);
  const byBoardRef = useRef<Partial<Record<string, Payload>>>({});
  const [members, setMembers] = useState<Members | null>(() => readMembers(publishedFile()));
  const [data, setData] = useState<Payload | null>(() => {
    const boards = publishedFile()?.boards ?? null;
    if (!boards) return null;
    byBoardRef.current = boards;
    readyRef.current = true;
    return boards[boardKey("1d", activeTapeSession())] ?? null;
  });
  const [failed, setFailed] = useState(false);
  const [on, setOn] = useState<Record<OverlayKey, boolean>>({
    yesterday: false,
    avg5: false,
    avg20: false,
  });

  const rangeRef = useRef<RangeKey>(range);
  const sessionRef = useRef<SessionKey>(session);
  rangeRef.current = range;
  sessionRef.current = session;

  useEffect(() => {
    let cancelled = false;
    const load = async (refresh: boolean) => {
      try {
        const early = (window as Window & { __washoutChart?: Promise<ChartFile | null> }).__washoutChart;
        let file: ChartFile | null = refresh ? null : publishedFile();
        if (!file?.boards && !refresh && early) file = await early;
        if (!file?.boards) {
          const res = await fetch(washoutChartUrl());
          if (res.ok) file = (await res.json()) as ChartFile;
        }
        if (!file?.boards) {
          const res = await fetch("/api/washout");
          if (res.ok) file = (await res.json()) as ChartFile;
        }
        if (file?.boards && !readMembers(file)) {
          const res = await fetch("/api/washout");
          if (res.ok) {
            const extra = (await res.json()) as ChartFile;
            if (readMembers(extra)) file = { ...file, members: extra.members };
          }
        }
        if (cancelled) return;
        const nextMembers = readMembers(file);
        if (nextMembers) setMembers(nextMembers);
        const boards = file?.boards ?? null;
        const key = boardKey(rangeRef.current, sessionRef.current);
        const board = boards?.[key];
        if (board && boards) {
          byBoardRef.current = boards;
          readyRef.current = true;
          setData(board);
          setFailed(false);
          return;
        }
        if (!readyRef.current) setFailed(true);
      } catch {
        if (!cancelled && !readyRef.current) setFailed(true);
      }
    };
    void load(false);
    const id = window.setInterval(() => void load(true), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const board = byBoardRef.current[boardKey(range, session)];
    if (board) setData(board);
  }, [range, session]);

  const chart = data?.range === range && data?.session === session ? data : null;
  const reactionChart: Payload | null = chart
    ? {
        ...chart,
        series: chart.reaction?.series ?? [],
        compare: chart.reaction?.compare,
        index: chart.reaction?.index,
      }
    : null;
  const roster = (kind: "index" | "reaction"): { names: Member[] | null; namesNote?: string } => {
    if (!members) return { names: null };
    if (members.session && members.session !== session) {
      return { names: [], namesNote: t("similar.membersOther") };
    }
    const names = kind === "index" ? members.index : members.reaction;
    return { names, namesNote: names.length === 0 ? t("similar.membersEmpty") : undefined };
  };
  const indexRoster = roster("index");
  const reactionRoster = roster("reaction");

  const paneProps = {
    range,
    session,
    onRange: setRange,
    onSession: setSession,
    overlaysOn: on,
    onToggleOverlay: (key: OverlayKey) => setOn((prev) => ({ ...prev, [key]: !prev[key] })),
  };

  return (
    <main className="mx-auto w-full max-w-6xl space-y-4">
      <header>
        <p className="text-sm font-medium text-muted-foreground">{t("similar.kicker")}</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">{t("similar.title")}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{t("similar.lead")}</p>
      </header>

      {failed && !data ? (
        <p className="text-sm text-muted-foreground">{t("similar.error")}</p>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          <IndexPane label={t("similar.indexLabel")} chart={chart} {...indexRoster} {...paneProps} />
          <IndexPane
            label={t("similar.reactionLabel")}
            hint={t("similar.reactionLead")}
            chart={reactionChart}
            {...reactionRoster}
            {...paneProps}
          />
        </div>
      )}
    </main>
  );
}
