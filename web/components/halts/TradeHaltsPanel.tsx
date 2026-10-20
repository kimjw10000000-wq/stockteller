"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { isLudpReason } from "@/lib/halts/elapsed";
import type { TradeHaltItem } from "@/lib/halts/nasdaq-trade-halts";
import { ProtectedContent } from "@/components/security/ProtectedContent";
import { useI18n } from "@/components/i18n/I18nProvider";
import { ensureKoreanShareNames, subscribeKoreanShareNames } from "@/lib/companies/korean-names-client";
import { haltCardFace, openHaltCount } from "@/lib/halts/halt-board";
import {
  closeHaltWidget,
  getHaltWidgetState,
  haltCardsAt,
  haltCompanyName,
  openHaltWidget,
  patchHaltWidget,
  primeHaltWidget,
  rankHaltCards,
  subscribeHaltWidget,
  watchHaltCards,
} from "@/lib/halts/halt-widget";

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

export function TradeHaltsPanel() {
  const { t, locale } = useI18n();
  const [namesRev, setNamesRev] = useState(0);
  const [items, setItems] = useState<TradeHaltItem[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [query, setQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [floating, setFloating] = useState(false);
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

  const cardsNow = haltCardsAt(nowMs);
  const haltedNow = openHaltCount(cardsNow ?? [], nowMs);
  const ranked = cardsNow ? rankHaltCards(cardsNow, query, locale) : null;

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !cardsNow) return [];
    return rankHaltCards(cardsNow, q, locale).cards.filter((row) => rankHaltCards(cardsNow, q, locale).matched.has(row.ticker)).slice(0, 8);
  }, [cardsNow, query, locale, namesRev]);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await fetch("/api/halts", { cache: "default" });
      const j = (await res.json()) as HaltsResponse;
      if (!res.ok && j.error) {
        if (!opts?.silent) {
          setError(j.error);
          setItems([]);
        }
      } else {
        const nextItems = j.items ?? [];
        setItems(nextItems);
        patchHaltWidget({ rss: nextItems });
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
    void ensureKoreanShareNames();
    return subscribeKoreanShareNames(() => setNamesRev((rev) => rev + 1));
  }, []);

  useEffect(() => watchHaltCards(), []);

  useEffect(() => subscribeHaltWidget(() => {
    setFloating(getHaltWidgetState().mode !== "off");
    setNowMs(Date.now());
  }), []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load({ silent: true }), CLIENT_POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

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

  const focusRow = useCallback((ticker: string) => {
    const key = ticker;
    setQuery(ticker);
    setDropdownOpen(false);

    const el = document.getElementById(`halt-card-${ticker}`);
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
      <p className="text-xs font-medium text-neutral-950">{t("halts.kicker")}</p>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <h1 className="shrink-0 text-xl font-bold tracking-tight text-neutral-950 sm:text-2xl">
          {t("nav.halts")}
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
                focusRow(suggestions[0].ticker);
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
                <li className="px-3 py-2 text-xs text-neutral-950">목록에 일치 항목 없음</li>
              ) : (
                suggestions.map((row) => (
                  <li key={row.ticker} role="option" aria-selected={query.trim().toUpperCase() === row.ticker}>
                    <button
                      type="button"
                      className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors hover:bg-neutral-50"
                      onClick={() => focusRow(row.ticker)}
                    >
                      <span className="font-mono text-sm font-bold tracking-wide text-neutral-950">
                        {row.ticker}
                      </span>
                      <span className="line-clamp-1 text-[11px] text-neutral-950">{row.name}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>
      </div>

      <p className="text-xs text-neutral-950">
        나스닥/미국 주식 Halt · 재개 일정 (사용자 현지 시간 기준)
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] leading-snug text-neutral-950">
          서버 중계 · 목록 {CLIENT_POLL_MS / 1000}초마다 동기화
          <span className="ml-1.5 text-neutral-950">
            · NASDAQ RSS 원본 최대 1분 (가이드 준수)
          </span>
          {relayMeta.servedFromCache != null ? (
            <span className="ml-1.5 text-neutral-950">
              · {relayMeta.servedFromCache ? "캐시" : "원본 갱신"}
              {typeof relayMeta.upstreamAgeMs === "number"
                ? ` ${Math.round(relayMeta.upstreamAgeMs / 1000)}초 전`
                : ""}
            </span>
          ) : null}
          {fetchedAt ? (
            <span className="ml-1.5 text-neutral-950">
              · {new Date(fetchedAt).toLocaleString("ko-KR")}
            </span>
          ) : null}
          {hasLudp ? (
            <span className="ml-1.5 text-neutral-950">· LUDP 경과 실시간</span>
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
        <div className="flex items-center justify-between gap-2 border-b border-neutral-200 bg-white px-3 py-2">
          <h2 className="text-xs font-bold text-neutral-950">{t("halts.board")}</h2>
          <button
            type="button"
            aria-pressed={floating || picking}
            onClick={() => {
              if (floating) {
                setPicking(false);
                closeHaltWidget();
                return;
              }
              setPicking((on) => {
                if (!on) primeHaltWidget();
                return !on;
              });
            }}
            className={
              floating || picking
                ? "min-h-8 shrink-0 rounded-full bg-neutral-950 px-3 py-1 text-xs font-medium text-white"
                : "min-h-8 shrink-0 rounded-full border border-neutral-400 px-3 py-1 text-xs font-medium text-neutral-950"
            }
          >
            {floating ? t("halts.floatClose") : t("halts.float")}
          </button>
        </div>
        <p className="border-b border-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-950">
          {t("halts.haltedCount", { count: haltedNow })}
        </p>

        {loading && items.length === 0 && cardsNow == null ? (
          <div className="flex items-center justify-center gap-2 px-3 py-10 text-xs text-neutral-950">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t("halts.loading")}
          </div>
        ) : !ranked || ranked.cards.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-neutral-950">{t("halts.empty")}</div>
        ) : (
          <ul className="space-y-2 p-3">
            {ranked.cards.map((row) => {
              const face = haltCardFace(row, nowMs);
              const hit = ranked.matched.has(row.ticker);
              const name = haltCompanyName(row, locale);
              return (
                <li key={row.ticker} id={`halt-card-${row.ticker}`} className="flex items-start gap-2">
                  {picking && !floating ? (
                    <input
                      type="checkbox"
                      className="mt-4 h-6 w-6 shrink-0 accent-neutral-950"
                      aria-label={name}
                      onChange={() => {
                        setPicking(false);
                        openHaltWidget(row.ticker);
                      }}
                    />
                  ) : null}
                  <div
                    className={
                      hit || highlightKey === row.ticker
                        ? "min-w-0 flex-1 rounded-lg border-2 border-yellow-500 bg-yellow-200 px-3 py-3"
                        : "min-w-0 flex-1 rounded-lg border-2 border-neutral-300 bg-white px-3 py-3"
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-snug text-neutral-950">{name}</p>
                        <p className="font-mono text-xs text-neutral-600">
                          {row.ticker}
                          {row.market ? ` · ${row.market}` : ""}
                        </p>
                        <p className="mt-1 text-[11px] text-neutral-700">
                          {row.reasonLabel || (row.kind === "volatility" ? t("halts.volatility") : t("halts.news"))}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        {face.resumed ? (
                          <p className="text-3xl font-bold text-green-700">{t("halts.resumed")}</p>
                        ) : face.timed ? (
                          <>
                            <p className="text-[11px] text-neutral-600">{t("halts.until")}</p>
                            <p className="font-mono text-4xl font-bold tabular-nums text-neutral-950">{face.countdown}</p>
                          </>
                        ) : (
                          <>
                            <p className="text-[11px] text-neutral-600">{t("halts.waiting")}</p>
                            <p className="text-3xl font-bold text-neutral-950">{t("halts.unknown")}</p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </ProtectedContent>

      <p className="text-[10px] leading-relaxed text-neutral-950">{t("halts.note")}</p>
    </div>
  );
}
