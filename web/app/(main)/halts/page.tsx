import type { Metadata } from "next";
import { TradeHaltsPanel } from "@/components/halts/TradeHaltsPanel";
import { SITE_NAME_KO } from "@/lib/site";

export const metadata: Metadata = {
  title: "TradeHalt",
  description: `${SITE_NAME_KO} — 나스닥/미국 주식 거래 정지(Halt) 및 해제 현황`,
  alternates: { canonical: "/halts" },
};

export default function HaltsPage() {
  return (
    <main className="mx-auto w-full max-w-[760px]">
      <TradeHaltsPanel />
    </main>
  );
}
