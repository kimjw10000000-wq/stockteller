import type { Metadata } from "next";
import { SimilarMoversContent } from "@/components/market/SimilarMoversContent";
import { SITE_NAME_KO } from "@/lib/site";

export const metadata: Metadata = {
  title: "설거지 지수",
  description: `${SITE_NAME_KO} — 설거지 지수`,
  alternates: { canonical: "/similar-movers" },
};

export default function SimilarMoversPage() {
  return <SimilarMoversContent />;
}
