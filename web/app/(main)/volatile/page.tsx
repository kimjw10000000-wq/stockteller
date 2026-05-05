import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { VolatileStocksLive } from "@/components/VolatileStocksLive";
import { SITE_NAME_KO } from "@/lib/site";

export const metadata: Metadata = {
  title: "급등 감시",
  description: `${SITE_NAME_KO} — 글로벌 고변동 종목 실시간`,
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
          공시 요약으로
        </Link>
      </nav>

      <h1 className="text-2xl font-bold text-slate-900">급등 · 고변동 감시</h1>
      <p className="mt-2 text-sm text-slate-500">
        Finnhub / KIS / J-Quants 엔진이 Supabase에 기록한 종목이 여기에 반영됩니다. Realtime은 Supabase 대시보드에서
        테이블 replication을 켜야 합니다.
      </p>

      <div className="mt-8">
        <VolatileStocksLive />
      </div>
    </main>
  );
}
