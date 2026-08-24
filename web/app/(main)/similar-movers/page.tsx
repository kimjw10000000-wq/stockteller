import type { Metadata } from "next";
import { SimilarMoversContent } from "@/components/market/SimilarMoversContent";
import { SITE_NAME_KO } from "@/lib/site";

export const metadata: Metadata = {
  title: "비슷한 급등주 찾기",
  description: `${SITE_NAME_KO} — 비슷한 급등주 찾기 (준비 중)`,
  alternates: { canonical: "/similar-movers" },
};

export default function SimilarMoversPage() {
  return <SimilarMoversContent />;
}
