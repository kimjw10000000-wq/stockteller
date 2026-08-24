import type { Metadata } from "next";
import { NewsSecContent } from "@/components/news/NewsSecContent";
import { loadWireNews } from "@/lib/gnw/query";
import { SITE_NAME_KO } from "@/lib/site";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "News/SEC",
  description: `${SITE_NAME_KO} — 미국 상장사 GlobeNewswire 보도자료 AI 요약`,
  alternates: { canonical: "/news-sec" },
};

export default async function NewsSecPage() {
  const items = await loadWireNews();
  return <NewsSecContent items={items} />;
}
