"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  formatElapsedKo,
  formatEtWallToLocal,
  haltEventMs,
  isLudpReason,
  ludpElapsedEndMs,
  parseHaltEtMs,
} from "@/lib/halts/elapsed";
import type { TradeHaltItem } from "@/lib/halts/nasdaq-trade-halts";
import { ProtectedContent } from "@/components/security/ProtectedContent";
import { useI18n } from "@/components/i18n/I18nProvider";

type HaltsResponse = {
  items: TradeHaltItem[];
  fetchedAt?: string;
  count?: number;
  error?: string;
  servedFromCache?: boolean;
  upstreamAgeMs?: number;
  upstreamPollIntervalMs?: number;
  relay?: string;
  providerLabel?: string;
};

/** 서버 메모리 캐시를 자주 읽어, NASDAQ 업스트림이 바뀌면 수 초 내 UI 반영 */
const CLIENT_POLL_MS = 5_000;

function LocalDateTimeCell({
  etDate,
  etTime,
  eventAtIso,
  requireTime = false,
}: {
  etDate: string | null | undefined;
  etTime: string | null | undefined;
  /** Absolute ISO (Toss VI 등) — ET wall clock보다 우선 */
  eventAtIso?: string | null;
  /** 재개 시각처럼 시간 필드가 비면 '미정' */
  requireTime?: boolean;
}) {
  if (eventAtIso?.trim()) {
    const ms = Date.parse(eventAtIso);
    if (Number.isFinite(ms)) {
      const d = new Date(ms);
      const time = d.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      });
      const date = d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      return (
        <span className="block tabular-nums">
          <span className="block text-[12px] font-bold leading-tight text-neutral-950">{time}</span>
          <span className="mt-0.5 block text-[10px] font-normal leading-tight text-neutral-500">
            {date}
          </span>
        </span>
      );
    }
  }

  if (requireTime && !(etTime ?? "").trim()) {
    return <span className="text-[11px] font-medium text-neutral-500">미정</span>;
  }
  const parts = formatEtWallToLocal(etDate, etTime);
  if (parts.empty) {
    return <span className="text-[11px] font-medium text-neutral-500">미정</span>;
  }
  return (
    <span className="block tabular-nums">
      <span className="block text-[12px] font-bold leading-tight text-neutral-950">{parts.time}</span>
      <span className="mt-0.5 block text-[10px] font-normal leading-tight text-neutral-500">
        {parts.date}
      </span>
    </span>
  );
}

function rowKey(row: TradeHaltItem): string {
  return `${row.symbol}__${row.haltDate}__${row.haltTime}__${row.reasonCode}__${row.source ?? ""}`;
}

function rowDomId(row: TradeHaltItem): string {
  return `halt-row-${rowKey(row).replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
}

function ElapsedCell({
  row,
  nowMs,
}: {
  row: TradeHaltItem;
  nowMs: number;
}) {
  if (!isLudpReason(row.reasonCode)) {
    return <span className="text-[11px] font-medium text-neutral-500">장기 정지</span>;
  }

  const haltMs = haltEventMs(row) || parseHaltEtMs(row.haltDate, row.haltTime);
  if (haltMs == null || haltMs <= 0) {
    return <span className="text-[11px] font-medium text-neutral-500">—</span>;
  }

  // 거래 재개 시각이 있으면 타이머 고정 = 재개 − 정지 (RSS 1분 지연 보정)
  const endMs = ludpElapsedEndMs(row, nowMs);
  const frozen = Boolean((row.resumptionTradeTime ?? "").trim());

  return (
    <span
      className={`font-mono text-[12px] font-bold tabular-nums ${
        frozen ? "text-neutral-600" : "text-neutral-950"
      }`}
    >
      {formatElapsedKo(haltMs, endMs)}
    </span>
  );
}

export function TradeHaltsPanel() {
  const { t } = useI18n();
  const [items, setItems] = useState<TradeHaltItem[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [query, setQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const [relayMeta, setRelayMeta] = useState<{
    servedFromCache?: boolean;
    upstreamAgeMs?: number;
    providerLabel?: string;
  }>({});
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const highlightTimerRef = useRef<number | null>(null);

  const hasLudp = useMemo(
    () => items.some((i) => isLudpReason(i.reasonCode)),
    [items]
  );

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return items
      .filter(
        (row) =>
          row.symbol.toLowerCase().includes(q) ||
          row.name.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [items, query]);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await fetch("/api/halts", { cache: "no-store" });
      const j = (await res.json()) as HaltsResponse;
      if (!res.ok && j.error) {
        if (!opts?.silent) {
          setError(j.error);
          setItems([]);
        }
      } else {
        setItems(j.items ?? []);
        setFetchedAt(j.fetchedAt ?? null);
        setRelayMeta({
          servedFromCache: j.servedFromCache,
          upstreamAgeMs: j.upstreamAgeMs,
          providerLabel: j.providerLabel,
        });
        if (j.error && !opts?.silent) setError(j.error);
      }
    } catch (e) {
      if (!opts?.silent) {
        setError(e instanceof Error ? e.message : "불러오기 실패");
        setItems([]);
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load({ silent: true }), CLIENT_POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (!hasLudp) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [hasLudp]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!searchWrapRef.current?.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current != null) {
        window.clearTimeout(highlightTimerRef.current);
      }
    };
  }, []);

  const focusRow = useCallback((row: TradeHaltItem) => {
    const key = rowKey(row);
    setQuery(row.symbol);
    setDropdownOpen(false);

    const el = document.getElementById(rowDomId(row));
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    setHighlightKey(key);
    if (highlightTimerRef.current != null) {
      window.clearTimeout(highlightTimerRef.current);
    }
    highlightTimerRef.current = window.setTimeout(() => {
      setHighlightKey(null);
      highlightTimerRef.current = null;
    }, 2800);
  }, []);

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-neutral-500">{t("halts.kicker")}</p>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <h1 className="shrink-0 text-xl font-bold tracking-tight text-neutral-950 sm:text-2xl">
          TradeHalt
        </h1>
        <div ref={searchWrapRef} className="relative min-w-[180px] flex-1 sm:max-w-[260px]">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setDropdownOpen(true);
            }}
            onFocus={() => setDropdownOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && suggestions[0]) {
                e.preventDefault();
                focusRow(suggestions[0]);
              }
              if (e.key === "Escape") setDropdownOpen(false);
            }}
            placeholder={t("halts.searchPlaceholder")}
            className="h-9 rounded-lg border-border bg-input-background pl-8 text-sm"
            aria-label={t("halts.searchAria")}
            autoComplete="off"
          />
          {dropdownOpen && query.trim() ? (
            <ul
              className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-64 overflow-auto rounded-lg border border-border bg-white py-1 shadow-md"
              role="listbox"
            >
              {suggestions.length === 0 ? (
                <li className="px-3 py-2 text-xs text-neutral-500">목록에 일치 항목 없음</li>
              ) : (
                suggestions.map((row) => (
                  <li key={rowKey(row)} role="option" aria-selected={query.trim().toUpperCase() === row.symbol}>
                    <button
                      type="button"
                      className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors hover:bg-neutral-50"
                      onClick={() => focusRow(row)}
                    >
                      <span className="font-mono text-sm font-bold tracking-wide text-neutral-950">
                        {row.symbol}
                      </span>
                      <span className="line-clamp-1 text-[11px] text-neutral-600">{row.name}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>
      </div>

      <p className="text-xs text-neutral-600">
        나스닥/미국 주식 Halt · 재개 일정 (사용자 현지 시간 기준)
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] leading-snug text-neutral-600">
          서버 중계 · 목록 {CLIENT_POLL_MS / 1000}초마다 동기화
          <span className="ml-1.5 text-neutral-500">
            · NASDAQ RSS 원본 최대 1분 (가이드 준수)
          </span>
          {relayMeta.servedFromCache != null ? (
            <span className="ml-1.5 text-neutral-500">
              · {relayMeta.servedFromCache ? "캐시" : "원본 갱신"}
              {typeof relayMeta.upstreamAgeMs === "number"
                ? ` ${Math.round(relayMeta.upstreamAgeMs / 1000)}초 전`
                : ""}
            </span>
          ) : null}
          {fetchedAt ? (
            <span className="ml-1.5 text-neutral-500">
              · {new Date(fetchedAt).toLocaleString("ko-KR")}
            </span>
          ) : null}
          {hasLudp ? (
            <span className="ml-1.5 text-neutral-500">· LUDP 경과 실시간</span>
          ) : null}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded border border-neutral-300 bg-white px-2 py-1 text-[11px] font-medium text-neutral-900 transition-colors hover:border-neutral-500 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          새로고침
        </button>
      </div>

      {error ? (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p>
      ) : null}

      <ProtectedContent className="overflow-hidden rounded border border-neutral-300 bg-white">
        <div className="border-b border-neutral-200 bg-white px-3 py-2">
          <h2 className="text-xs font-bold text-neutral-950">현재 Halt / Resume</h2>
        </div>

        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-3 py-10 text-xs text-neutral-600">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Halt 목록 불러오는 중…
          </div>
        ) : items.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-neutral-600">
            현재 표시할 Trade Halt가 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse bg-white text-left text-[12px] text-neutral-950">
              <thead>
                <tr className="border-b border-neutral-200 bg-white text-[10px] font-semibold uppercase tracking-wide text-neutral-700">
                  <th className="w-[22%] px-2.5 py-2">종목</th>
                  <th className="w-[9%] px-2 py-2">시장</th>
                  <th className="w-[16%] px-2 py-2">사유</th>
                  <th className="w-[13%] px-2 py-2">정지</th>
                  <th className="w-[12%] px-2 py-2">예상 재개</th>
                  <th className="w-[12%] px-2 py-2">거래 재개</th>
                  <th className="w-[16%] px-2 py-2">정지 경과 시간</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const key = rowKey(row);
                  const highlighted = highlightKey === key;
                  return (
                    <tr
                      key={key}
                      id={rowDomId(row)}
                      className={`border-b border-neutral-100 last:border-0 transition-colors duration-500 ${
                        highlighted ? "bg-amber-100" : "bg-white"
                      }`}
                    >
                      <td className="px-2.5 py-2.5 align-top">
                        <div className="flex items-baseline gap-1.5">
                          <span className="font-mono text-[15px] font-bold leading-none tracking-wide text-neutral-950">
                            {row.symbol}
                          </span>
                          {row.status === "resuming" ? (
                            <span className="text-[9px] font-semibold uppercase leading-none text-green-700">
                              Resume
                            </span>
                          ) : (
                            <span className="text-[9px] font-semibold uppercase leading-none text-red-600">
                              Halt
                            </span>
                          )}
                          {row.source === "toss-vi" ? (
                            <span className="text-[9px] font-semibold uppercase leading-none text-blue-700">
                              Toss
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 max-w-[180px] text-[10px] leading-relaxed text-neutral-600">
                          {row.name}
                        </p>
                      </td>
                      <td className="px-2 py-2.5 align-top font-medium text-neutral-900">
                        {row.market || "—"}
                      </td>
                      <td className="px-2 py-2.5 align-top">
                        <span className="font-mono text-[13px] font-bold tracking-wide text-neutral-950">
                          {row.reasonCode}
                        </span>
                        <p className="mt-0.5 max-w-[130px] text-[10px] leading-snug text-neutral-700">
                          {row.reasonLabel}
                        </p>
                      </td>
                      <td className="px-2 py-2.5 align-top">
                        <LocalDateTimeCell
                          etDate={row.haltDate}
                          etTime={row.haltTime}
                          eventAtIso={row.eventAtIso}
                        />
                      </td>
                      <td className="px-2 py-2.5 align-top">
                        <LocalDateTimeCell
                          etDate={row.resumptionDate}
                          etTime={row.resumptionQuoteTime}
                          requireTime
                        />
                      </td>
                      <td className="px-2 py-2.5 align-top">
                        <LocalDateTimeCell
                          etDate={row.resumptionDate}
                          etTime={row.resumptionTradeTime}
                          requireTime
                        />
                      </td>
                      <td className="px-2 py-2.5 align-top">
                        <ElapsedCell row={row} nowMs={nowMs} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ProtectedContent>

      <p className="text-[10px] leading-relaxed text-neutral-500">
        출처: NASDAQ Trade Halt RSS(미국 Halt/Resume) + 토스 Open API(VI/유의·종목명·시장).
        목록은 정지 발생 일시 최신순입니다. LUDP·VI만 경과 타이머를 표시합니다.
      </p>
    </div>
  );
}
