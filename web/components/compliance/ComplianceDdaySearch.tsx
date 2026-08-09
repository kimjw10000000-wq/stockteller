"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Nasdaq5550Checklist } from "@/components/compliance/Nasdaq5550Checklist";
import {
  applyBidPriceHits,
  applyShelfRegistration,
  createDefaultNasdaq5550Record,
  type Nasdaq5550Record,
} from "@/lib/nasdaq-5550-mock";
import type { BidPriceNoticeResult } from "@/lib/sec/bid-price-deficiency-scan";
import type { ShelfRegistrationResult } from "@/lib/sec/shelf-registration-scan";

type CompanyHit = {
  ticker: string;
  name: string;
  marketCap: number | null;
  cik: string;
  exchange: string;
};

function formatCap(n: number | null): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "";
  if (n >= 1e12) return `시총 ${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `시총 ${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `시총 ${(n / 1e6).toFixed(1)}M`;
  return `시총 ${n.toLocaleString()}`;
}

export function ComplianceDdaySearch() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<CompanyHit[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [record, setRecord] = useState<Nasdaq5550Record>(() =>
    createDefaultNasdaq5550Record()
  );
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const suggestTimer = useRef<number | null>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setDropdownOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (suggestTimer.current != null) window.clearTimeout(suggestTimer.current);
    const q = query.trim();
    if (q.length < 1) {
      setSuggestions([]);
      return;
    }
    suggestTimer.current = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/compliance/companies?q=${encodeURIComponent(q)}&limit=12`,
            { cache: "no-store" }
          );
          const j = (await res.json()) as { items?: CompanyHit[] };
          setSuggestions(j.items ?? []);
        } catch {
          setSuggestions([]);
        }
      })();
    }, 220);
    return () => {
      if (suggestTimer.current != null) window.clearTimeout(suggestTimer.current);
    };
  }, [query]);

  async function runScan(tickerInput: string) {
    const ticker = tickerInput.trim().toUpperCase().replace(/\./g, "-");
    if (!ticker) {
      setError("티커를 입력하세요.");
      setStatusMsg(null);
      setRecord(createDefaultNasdaq5550Record());
      return;
    }

    setLoading(true);
    setError(null);
    setDropdownOpen(false);
    setStatusMsg(`${ticker} · SEC EDGAR 스캔 중 (bid-price · S-3/F-3)…`);
    setRecord(createDefaultNasdaq5550Record(ticker, "조회 중…"));

    try {
      const [bidRes, shelfRes] = await Promise.all([
        fetch(`/api/compliance/bid-price-notice?ticker=${encodeURIComponent(ticker)}`, {
          cache: "no-store",
        }),
        fetch(`/api/compliance/shelf-registration?ticker=${encodeURIComponent(ticker)}`, {
          cache: "no-store",
        }),
      ]);

      const j = (await bidRes.json()) as BidPriceNoticeResult | { ok: false; error?: string };
      const shelf = (await shelfRes.json()) as
        | ShelfRegistrationResult
        | { ok: false; error?: string };

      if (!bidRes.ok || !j.ok) {
        setRecord(createDefaultNasdaq5550Record());
        setError(("error" in j && j.error) || "조회할 수 없는 티커입니다.");
        setStatusMsg(null);
        return;
      }

      let next = applyBidPriceHits(
        createDefaultNasdaq5550Record(j.ticker, j.companyName),
        j.hits ?? []
      );
      if (shelf.ok) {
        next = applyShelfRegistration(next, shelf);
      }
      setRecord(next);
      setQuery(j.ticker);

      const parts: string[] = [];
      if (j.found && j.filingDates.length > 0) {
        parts.push(
          j.filingDates.length === 1
            ? `bid-price ${j.filingDates[0]}`
            : `bid-price ${j.filingDates.length}건`
        );
      } else {
        parts.push("bid-price 위반 없음");
      }
      if (shelf.ok) {
        parts.push(
          shelf.hasS3
            ? `S-3/F-3 ${shelf.filingDateLabel ?? shelf.filingDate}`
            : "S-3/F-3 없음"
        );
      }
      setStatusMsg(`${j.ticker} · ${parts.join(" · ")}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setStatusMsg(null);
      setRecord(createDefaultNasdaq5550Record());
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="-mx-4 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-xl sm:mx-0">
      <div className="border-b border-slate-700 px-4 py-6 sm:px-8">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
          Delisting Risk · D-Day
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">
          상장폐지 위험 D-Day 검색
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
          NYSE / NASDAQ 상장사 전체 검색 · 조건: (8-K Item 3.01{" "}
          <span className="text-slate-300">또는</span> 6-K Ex.99.1/본문){" "}
          <span className="text-slate-300">그리고</span> ($1.00{" "}
          <span className="text-slate-300">또는</span> $0.10). 최근 8개월 매칭 공시일을 모두
          표시합니다.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runScan(query);
          }}
          className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-stretch"
        >
          <div ref={wrapRef} className="relative min-w-0 flex-1">
            <label className="relative block">
              <span className="sr-only">티커 · 회사명 검색</span>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                aria-hidden
              />
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setDropdownOpen(true);
                }}
                onFocus={() => setDropdownOpen(true)}
                placeholder="티커 또는 회사명 (예: AAPL, NVIDIA)"
                autoCapitalize="characters"
                spellCheck={false}
                disabled={loading}
                className="h-11 w-full rounded-lg border border-slate-600 bg-slate-800/80 pl-10 pr-3 font-mono text-sm text-white outline-none placeholder:text-slate-500 focus:border-slate-400 focus:ring-2 focus:ring-slate-500/40 disabled:opacity-60"
                aria-label="티커 · 회사명 검색"
                autoComplete="off"
              />
            </label>
            {dropdownOpen && query.trim() && suggestions.length > 0 ? (
              <ul
                className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-72 overflow-auto rounded-lg border border-slate-600 bg-slate-900 py-1 shadow-xl"
                role="listbox"
              >
                {suggestions.map((row) => (
                  <li key={row.ticker} role="option" aria-selected={query.toUpperCase() === row.ticker}>
                    <button
                      type="button"
                      className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-slate-800"
                      onClick={() => {
                        setQuery(row.ticker);
                        void runScan(row.ticker);
                      }}
                    >
                      <span className="flex flex-wrap items-baseline gap-2">
                        <span className="font-mono text-sm font-bold text-white">{row.ticker}</span>
                        <span className="text-[11px] text-slate-400">{row.exchange}</span>
                        {row.marketCap != null ? (
                          <span className="text-[11px] text-slate-500">{formatCap(row.marketCap)}</span>
                        ) : null}
                      </span>
                      <span className="line-clamp-1 text-[11px] text-slate-400">{row.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-white px-5 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-200 disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                SEC 조회 중
              </>
            ) : (
              "검색"
            )}
          </button>
        </form>

        {error ? (
          <p
            className="mt-4 rounded-lg border border-rose-500/50 bg-rose-500/10 px-3 py-2.5 text-sm font-medium text-rose-300"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        {statusMsg ? (
          <p className="mt-3 text-sm text-slate-400" role="status">
            {statusMsg}
          </p>
        ) : null}
      </div>

      <div className="px-4 py-6 sm:px-8 sm:py-8">
        <p className="mb-4 text-sm font-semibold text-slate-200">
          나스닥 5550 상장 유지 기준 체크리스트
        </p>
        <Nasdaq5550Checklist record={record} loading={loading} />
      </div>
    </div>
  );
}
