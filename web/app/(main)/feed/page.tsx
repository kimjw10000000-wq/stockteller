import type { Metadata } from "next";
import { FileWarning } from "lucide-react";
import { AdSlot } from "@/components/AdSlot";
import { DisclosureCard } from "@/components/DisclosureCard";
import { listDisclosures } from "@/lib/disclosures";
import { SITE_NAME_EN, SITE_NAME_KO, SITE_TAGLINE } from "@/lib/site";

export const metadata: Metadata = {
  title: "최신 공시 요약",
  description: `${SITE_NAME_KO}(${SITE_NAME_EN}) — ${SITE_TAGLINE}`,
  alternates: {
    canonical: "/feed",
  },
  openGraph: {
    title: `최신 공시 요약 · ${SITE_NAME_KO}`,
    description: SITE_TAGLINE,
  },
};

export default async function FeedPage() {
  const items = await listDisclosures(40);

  return (
    <main>
      <AdSlot position="top" />

      <section aria-labelledby="feed-heading" className="space-y-2">
        <h1 id="feed-heading" className="text-2xl font-bold tracking-tight text-slate-900">
          최신 공시 요약
        </h1>
        <p className="text-sm text-slate-500">
          {SITE_NAME_KO} — 나스닥 등 미국 시장 공시를 AI가 의도·재무 영향·결론 세 줄로 정리합니다. 카드를 눌러
          상세를 보세요.
        </p>
      </section>

      <AdSlot position="middle" className="my-6" />

      {items.length === 0 ? (
        <div
          className="mt-8 flex flex-col items-center rounded-2xl border border-amber-100 bg-amber-50/60 px-6 py-12 text-center"
          role="status"
        >
          <FileWarning className="mb-3 h-10 w-10 text-amber-500" aria-hidden />
          <p className="text-sm font-medium text-amber-900">아직 불러올 공시가 없습니다.</p>
          <p className="mt-2 max-w-md text-xs text-amber-800/80">
            Supabase 스키마를 적용하고 환경 변수를 설정한 뒤, 데이터를 넣어 주세요.
          </p>
        </div>
      ) : (
        <ul className="mt-8 flex flex-col gap-4" role="list">
          {items.map((item) => (
            <li key={item.id}>
              <DisclosureCard item={item} />
            </li>
          ))}
        </ul>
      )}

      <AdSlot position="bottom" />
    </main>
  );
}
