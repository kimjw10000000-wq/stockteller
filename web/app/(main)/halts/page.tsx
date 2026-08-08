import type { Metadata } from "next";
import { TradeHaltsPanel } from "@/components/halts/TradeHaltsPanel";
import { SITE_NAME_KO } from "@/lib/site";

export const metadata: Metadata = {
  title: "실시간 서킷 현황",
  description: `${SITE_NAME_KO} — 나스닥/미국 주식 거래 정지(Halt) 및 해제 현황`,
  alternates: { canonical: "/halts" },
};

export default function HaltsPage() {
  return (
    <main className="mx-auto w-full max-w-[760px]">
      <p className="text-xs font-medium text-neutral-500">Market · Halts</p>
      <h1 className="mt-1 text-xl font-bold tracking-tight text-neutral-950 sm:text-2xl">
        실시간 서킷 현황
      </h1>
      <p className="mt-1 text-xs text-neutral-600">나스닥/미국 주식 Halt · 재개 일정 (ET)</p>

      <TradeHaltsPanel />
    </main>
  );
}
