"use client";

import Link from "next/link";
import { useUsMarketGainers } from "@/hooks/use-us-market-gainers";

const US_HOME_MIN_PCT = 20;
const POLL_MS = 60_000;

export function UsHomeGainersBanner() {
  const { items, err, source, loading, delayedMarketSnapshot, finnhubQuoteRefined } =
    useUsMarketGainers(US_HOME_MIN_PCT, POLL_MS);

  if (loading) {
    return (
      <div className="w-full border-b border-blue-100/90 bg-white/95 px-4 py-2 text-center text-xs text-slate-500 sm:px-6">
        미국 +20% 급등 목록 불러오는 중…
      </div>
    );
  }

  if (items.length === 0 && !err) return null;

  return (
    <div className="w-full border-b border-blue-100/90 bg-white/95 shadow-sm backdrop-blur-sm">
      <div className="mx-auto w-full max-w-3xl px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="text-xs font-bold uppercase tracking-wide text-[#3182f6]">US +20%↑</p>
          <p className="text-xs text-slate-500">
            미국 주식 ·{" "}
            {source === "yahoo-browser"
              ? "브라우저 Yahoo(당일 스크리너)"
              : source === "alphavantage"
                ? "Alpha Vantage(전일/지연 스냅샷일 수 있음)"
                : source === "yahoo-api"
                  ? finnhubQuoteRefined
                    ? "서버 Yahoo + Finnhub 등락 보정"
                    : "서버 Yahoo 스크리너"
                  : "갱신 중"}
            {delayedMarketSnapshot ? " · 예전 장 기준이면 종목이 ‘어제’처럼 보일 수 있음" : null}
          </p>
          <Link
            href="/volatile#market-us"
            className="text-xs font-medium text-[#3182f6] hover:text-[#1b64da] hover:underline"
          >
            급등 감시 페이지 →
          </Link>
        </div>
        {err && items.length === 0 ? (
          <p className="mt-2 text-xs text-amber-800">{err}</p>
        ) : null}
        {items.length > 0 ? (
          <ul
            className="mt-2 flex max-w-full gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5"
            role="list"
          >
            {items.map((x) => {
              const label = x.shortName || x.longName || x.symbol;
              const pct = x.regularMarketChangePercent;
              return (
                <li key={x.symbol} className="shrink-0 list-none">
                  <a
                    href={`https://finance.yahoo.com/quote/${encodeURIComponent(x.symbol)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex max-w-[11rem] flex-col rounded-xl border border-slate-200/90 bg-slate-50/90 px-2.5 py-1.5 text-left shadow-sm ring-1 ring-slate-100/80 transition hover:border-blue-200 hover:bg-blue-50/60"
                    title={label}
                  >
                    <span className="font-mono text-xs font-semibold text-slate-900">{x.symbol}</span>
                    <span className="truncate text-[11px] text-slate-500">{label}</span>
                    <span className="text-xs font-semibold text-rose-600">+{pct.toFixed(2)}%</span>
                  </a>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
