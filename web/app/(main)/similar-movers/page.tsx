import type { Metadata } from "next";
import { SimilarMoversContent } from "@/components/market/SimilarMoversContent";
import { washoutChartOrigin } from "@/lib/us-market/washout-chart-url";
import { SITE_NAME_KO } from "@/lib/site";

export const metadata: Metadata = {
  title: "설거지 지수",
  description: `${SITE_NAME_KO} — 설거지 지수`,
  alternates: { canonical: "/similar-movers" },
};

export default function SimilarMoversPage() {
  const origin = washoutChartOrigin();
  const preload = origin
    ? `(function(){var m=Math.floor(Date.now()/60000);window.__washoutChart=fetch(${JSON.stringify(origin)}+"/storage/v1/object/public/washout-catalog/current.json?m="+m).then(function(r){if(!r.ok)throw new Error("chart");return r.json()}).then(function(j){window.__washoutReady=j;return j}).catch(function(){return null})})();`
    : "";
  return (
    <>
      {preload ? <script dangerouslySetInnerHTML={{ __html: preload }} /> : null}
      <SimilarMoversContent />
    </>
  );
}
