import type { Metadata } from "next";
import { NewsSecContent } from "@/components/news/NewsSecContent";
import { SITE_NAME_KO } from "@/lib/site";

export const metadata: Metadata = {
  title: "News/SEC",
  description: `${SITE_NAME_KO} — AI Newsfilter 및 SEC EDGAR 공시 요약·감성 분석`,
  alternates: { canonical: "/news-sec" },
};

export default function NewsSecPage() {
  return <NewsSecContent />;
}
