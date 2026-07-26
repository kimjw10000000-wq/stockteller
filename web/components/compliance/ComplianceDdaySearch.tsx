"use client";

import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Nasdaq5550Checklist } from "@/components/compliance/Nasdaq5550Checklist";
import { COMPLIANCE_SEED_TICKERS } from "@/lib/compliance-seed-tickers";
import {
  applyBidPriceHits,
  createDefaultNasdaq5550Record,
  type Nasdaq5550Record,
} from "@/lib/nasdaq-5550-mock";
import type { BidPriceNoticeResult } from "@/lib/sec/bid-price-deficiency-scan";

export function ComplianceDdaySearch() {
  const [query, setQuery] = useState("");
  const [record, setRecord] = useState<Nasdaq5550Record>(() =>
    createDefaultNasdaq5550Record()
  );
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSearch(e?: React.FormEvent) {
    e?.preventDefault();
    const ticker = query.trim().toUpperCase();

    if (!ticker) {
      setError("티커를 입력하세요.");
      setStatusMsg(null);
      setRecord(createDefaultNasdaq5550Record());
      return;
    }

    setLoading(true);
    setError(null);
    setStatusMsg(`${ticker} · SEC EDGAR 8-K/6-K ($1.00·$0.10) 스캔 중…`);
    setRecord(createDefaultNasdaq5550Record(ticker, "조회 중…"));

    try {
      const res = await fetch(
        `/api/compliance/bid-price-notice?ticker=${encodeURIComponent(ticker)}`,
        { cache: "no-store" }
      );
      const j = (await res.json()) as BidPriceNoticeResult | { ok: false; error?: string };

      if (!res.ok || !j.ok) {
        setRecord(createDefaultNasdaq5550Record());
        setError(("error" in j && j.error) || "현재 등록되지 않거나 조회할 수 없는 티커입니다.");
        setStatusMsg(null);
        return;
      }

      const next = applyBidPriceHits(
        createDefaultNasdaq5550Record(j.ticker, j.companyName),
        j.hits ?? []
      );
      setRecord(next);

      if (j.found && j.filingDates.length > 0) {
        setStatusMsg(
          j.filingDates.length === 1
            ? `${j.ticker} · 감지일 ${j.filingDates[0]} (${j.hits[0]?.sourceLabel ?? "SEC"})`
            : `${j.ticker} · 감지일 ${j.filingDates.length}건 포착 (${j.filingDates.join(", ")})`
        );
      } else {
        setStatusMsg(`${j.ticker} · 최근 8개월 $1.00/$0.10 관련 위반 이력 없음`);
      }
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
          시드 등록 {COMPLIANCE_SEED_TICKERS.length}개 티커 · 조건: (8-K Item 3.01{" "}
          <span className="text-slate-300">또는</span> 6-K Ex.99.1/본문){" "}
          <span className="text-slate-300">그리고</span> ($1.00{" "}
          <span className="text-slate-300">또는</span> $0.10). 최근 8개월 매칭 공시일을 모두
          표시합니다.
        </p>

        <form
          onSubmit={(e) => void onSearch(e)}
          className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-stretch"
        >
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">티커 검색</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value.toUpperCase())}
              placeholder="티커 입력 (예: FFAI, AAME, AIM)"
              list="compliance-seed-tickers"
              autoCapitalize="characters"
              spellCheck={false}
              disabled={loading}
              className="h-11 w-full rounded-lg border border-slate-600 bg-slate-800/80 pl-10 pr-3 font-mono text-sm text-white outline-none placeholder:text-slate-500 focus:border-slate-400 focus:ring-2 focus:ring-slate-500/40 disabled:opacity-60"
              aria-label="티커 검색"
            />
            <datalist id="compliance-seed-tickers">
              {COMPLIANCE_SEED_TICKERS.map((row) => (
                <option key={row.ticker} value={row.ticker}>
                  {row.companyName}
                </option>
              ))}
            </datalist>
          </label>
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
