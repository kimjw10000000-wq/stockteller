import type { Metadata } from "next";
import { AboutContent } from "@/components/legal/AboutContent";
import { SITE_NAME_KO } from "@/lib/site";

export const metadata: Metadata = {
  title: "사이트 소개",
  description: `${SITE_NAME_KO} — 미국 주식 공시·희석 감시·거래정지·거시지표를 정리하는 정보 사이트`,
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return <AboutContent />;
}
