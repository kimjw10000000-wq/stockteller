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
    <main>
      <p className="text-sm font-medium text-muted-foreground">Market · Halts</p>
      <h1 className="mt-1 text-2xl font-semibold text-foreground sm:text-3xl">
        실시간 서킷 현황
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        나스닥/미국 주식 Halt · 재개 일정 (ET)
      </p>

      <TradeHaltsPanel />
    </main>
  );
}
