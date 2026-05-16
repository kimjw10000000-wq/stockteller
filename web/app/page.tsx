import type { Metadata } from "next";
import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { UsHomeGainersBanner } from "@/components/UsHomeGainersBanner";
import { SITE_NAME_EN, SITE_NAME_KO, SITE_TAGLINE, getSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: `${SITE_NAME_KO} (${SITE_NAME_EN}) — 공시가 왜 올랐을까`,
  description: SITE_TAGLINE,
  keywords: [
    "왜 올라",
    "Whyup",
    "공시 요약",
    "SEC 공시",
    "나스닥",
    "AI 공시 분석",
    "주식 공시",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: `${SITE_NAME_KO} · ${SITE_NAME_EN}`,
    description: SITE_TAGLINE,
    type: "website",
    locale: "ko_KR",
    siteName: `${SITE_NAME_KO} (${SITE_NAME_EN})`,
    url: getSiteUrl().origin,
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME_KO,
  alternateName: [SITE_NAME_EN, "whyup"],
  description: SITE_TAGLINE,
  url: getSiteUrl().origin,
  inLanguage: "ko-KR",
  potentialAction: {
    "@type": "ReadAction",
    target: `${getSiteUrl().origin}/feed`,
  },
};

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <UsHomeGainersBanner />
      <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#f0f6ff] to-[#f7f9fc] px-4 py-16 text-center sm:px-6">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#3182f6] text-white shadow-lg shadow-blue-500/25">
          <TrendingUp className="h-8 w-8" aria-hidden />
        </div>
        <p className="text-sm font-medium uppercase tracking-widest text-[#3182f6]">
          {SITE_NAME_EN}
        </p>
        <h1 className="mt-2 text-balance text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          {SITE_NAME_KO}
        </h1>
        <p className="mx-auto mt-4 max-w-md text-pretty text-base text-slate-600 sm:text-lg">
          {SITE_TAGLINE}
        </p>
        <p className="mt-3 max-w-lg text-xs text-slate-400 sm:text-sm">
          Google 검색: <span lang="en">{SITE_NAME_EN}</span> 또는「
          <span className="text-slate-500">{SITE_NAME_KO}</span>」공시 요약
        </p>

        <div className="mt-10 grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
          <Link
            href="/volatile#market-us"
            className="rounded-2xl border border-blue-100 bg-white/90 px-4 py-4 text-left shadow-sm ring-1 ring-blue-100 transition hover:bg-blue-50/90"
          >
            <p className="text-xs font-bold uppercase tracking-wide text-[#3182f6]">US</p>
            <p className="mt-1 font-semibold text-slate-900">미국 주식</p>
            <p className="mt-1 text-xs text-slate-500">미국 장중 급등 스크리너(데이터 지연·출처별 차이 있음)</p>
          </Link>
          <Link
            href="/volatile#market-jp"
            className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-4 text-left shadow-sm ring-1 ring-slate-200/80 transition hover:bg-slate-50"
          >
            <p className="text-xs font-bold uppercase tracking-wide text-slate-600">JP</p>
            <p className="mt-1 font-semibold text-slate-900">일본 주식</p>
            <p className="mt-1 text-xs text-slate-500">J-Quants 최신 시세</p>
          </Link>
          <Link
            href="/volatile#market-kr"
            className="rounded-2xl border border-emerald-100 bg-white/90 px-4 py-4 text-left shadow-sm ring-1 ring-emerald-100 transition hover:bg-emerald-50/80"
          >
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">KR</p>
            <p className="mt-1 font-semibold text-slate-900">한국 주식</p>
            <p className="mt-1 text-xs text-slate-500">KIS 실시간 체결</p>
          </Link>
        </div>

        <div className="mt-10 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/feed"
            className="inline-flex min-h-[48px] min-w-[200px] items-center justify-center rounded-xl bg-[#3182f6] px-8 py-3 text-base font-semibold text-white shadow-md shadow-blue-500/20 transition hover:bg-[#1b64da] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3182f6] focus-visible:ring-offset-2"
          >
            웹사이트 보기 · 뉴스
          </Link>
          <Link
            href="/feed"
            className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            바로 뉴스로
          </Link>
        </div>
      </main>
    </div>
  );
}
