import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { VolatileStocksLive } from "@/components/VolatileStocksLive";
import { SITE_NAME_KO } from "@/lib/site";

export const metadata: Metadata = {
  title: "급등 감시",
  description: `${SITE_NAME_KO} — 미·일·한 고변동 종목`,
};

export default function VolatilePage() {
  return (
    <main>
      <nav className="mb-6" aria-label="뒤로">
        <Link
          href="/feed"
          className="inline-flex items-center gap-1 text-sm font-medium text-[#3182f6] hover:text-[#1b64da]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          뉴스로
        </Link>
      </nav>

      <h1 className="text-2xl font-bold text-slate-900">급등 · 고변동 감시</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-500">
        시장별로 미국·일본·한국을 나눕니다.{" "}
        <strong>미국</strong> 행의 <strong>호재</strong>/<strong>악재</strong>를 누르면 SEC 최근 8-K 본문을 가져와 Gemini가 각각 요약합니다.
        미국 급등은 <strong>Yahoo 스크리너로 후보</strong>를 잡고, <span className="whitespace-nowrap">FINNHUB_API_KEY</span>가
        있으면 서버에서 <strong>Finnhub 시세(dp)</strong>로 등락·가격을 맞춥니다(무료 플랜은 <strong>거래소 지연</strong>·티크 단위
        실시간은 아님). Yahoo가 막힐 때만 <span className="whitespace-nowrap">ALPHA_VANTAGE_API_KEY</span>로 채우는데, 그때는
        <strong>전일(또는 지연) 스냅샷</strong>일 수 있어 &ldquo;어제 종목&rdquo;처럼 보일 수 있습니다.{" "}
        <code className="rounded bg-slate-100 px-1">GEMINI_API_KEY</code>·
        <code className="rounded bg-slate-100 px-1">SEC_USER_AGENT</code>(연락 가능한 UA)도 필요합니다.
      </p>

      <nav
        className="mt-6 flex flex-wrap gap-2 text-xs sm:text-sm"
        aria-label="시장 바로가기"
      >
        <a
          href="#market-us"
          className="rounded-full bg-blue-50 px-3 py-1.5 font-medium text-[#1b64da] ring-1 ring-blue-200/80 hover:bg-blue-100"
        >
          미국 ↓
        </a>
        <a
          href="#market-jp"
          className="rounded-full bg-slate-100 px-3 py-1.5 font-medium text-slate-800 ring-1 ring-slate-200 hover:bg-slate-200"
        >
          일본 ↓
        </a>
        <a
          href="#market-kr"
          className="rounded-full bg-emerald-50 px-3 py-1.5 font-medium text-emerald-800 ring-1 ring-emerald-200/80 hover:bg-emerald-100"
        >
          한국 ↓
        </a>
      </nav>

      <div className="mt-8">
        <VolatileStocksLive />
      </div>
    </main>
  );
}
