import type { Metadata } from "next";
import { IndicatorsLivePanel } from "@/components/indicators/IndicatorsLivePanel";
import { SITE_NAME_KO } from "@/lib/site";

export const metadata: Metadata = {
  title: "주요지표 바로 보기",
  description: `${SITE_NAME_KO} — 미국 CPI / PPI 예측·실제 발표 실시간 보기`,
  alternates: { canonical: "/indicators" },
};

export default function IndicatorsPage() {
  return (
    <main className="mx-auto w-full max-w-[760px] px-4 py-6 sm:px-0 sm:py-8">
      <IndicatorsLivePanel />
    </main>
  );
}
