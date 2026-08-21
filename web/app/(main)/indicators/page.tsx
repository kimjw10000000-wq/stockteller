import type { Metadata } from "next";
import { IndicatorsLivePanel } from "@/components/indicators/IndicatorsLivePanel";
import { SITE_NAME_KO } from "@/lib/site";

export const metadata: Metadata = {
  title: "실시간 발표",
  description: `${SITE_NAME_KO} — CPI·PPI 등 경제지표와 기업 실적 발표`,
  alternates: { canonical: "/indicators" },
};

export default function IndicatorsPage() {
  return (
    <main className="mx-auto w-full max-w-[760px] px-4 py-6 sm:px-0 sm:py-8">
      <IndicatorsLivePanel />
    </main>
  );
}
