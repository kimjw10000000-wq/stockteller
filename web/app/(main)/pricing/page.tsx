import type { Metadata } from "next";
import { PricingContent } from "@/components/pricing/PricingContent";
import { SITE_NAME_KO } from "@/lib/site";

export const metadata: Metadata = {
  title: "요금제",
  description: `${SITE_NAME_KO} Pro — 지분희석 경보 슬롯 4개`,
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  return <PricingContent />;
}
