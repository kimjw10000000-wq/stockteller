import type { Metadata } from "next";
import { SimilarMoversContent } from "@/components/market/SimilarMoversContent";
import { SITE_NAME_KO } from "@/lib/site";

export const metadata: Metadata = {
  title: "설거지 지수",
  description: `${SITE_NAME_KO} — 설거지 지수`,
  alternates: { canonical: "/similar-movers" },
};

export default function SimilarMoversPage() {
  const preload = `(function(){window.__washoutChart=fetch("/api/washout").then(function(r){if(!r.ok)throw new Error("chart");return r.json()}).then(function(j){window.__washoutReady=j;return j}).catch(function(){return null})})();`;
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: preload }} />
      <SimilarMoversContent />
    </>
  );
}
