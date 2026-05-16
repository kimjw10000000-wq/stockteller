import type { Metadata } from "next";
import { FileWarning } from "lucide-react";
import { AdSlot } from "@/components/AdSlot";
import { DisclosureCard } from "@/components/DisclosureCard";
import { listDisclosures } from "@/lib/disclosures";
import { SITE_NAME_EN, SITE_NAME_KO, SITE_TAGLINE } from "@/lib/site";

export const metadata: Metadata = {
  title: "뉴스",
  description: `${SITE_NAME_KO}(${SITE_NAME_EN}) — AI가 정리한 뉴스·공시 요약`,
  alternates: {
    canonical: "/feed",
  },
  openGraph: {
    title: `뉴스 · ${SITE_NAME_KO}`,
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
          뉴스
        </h1>
        <p className="text-sm text-slate-500">
          AI로 요약한 소식이 <strong>올라온 순서대로</strong>(가장 최근 업로드가 위) 표시됩니다. 나스닥 등 공시·뉴스 성격의
          글을 세 줄 요약으로 정리했습니다. 카드를 눌러 상세를 보세요.
        </p>
      </section>

      <AdSlot position="middle" className="my-6" />

      {items.length === 0 ? (
        <div
          className="mt-8 flex flex-col items-center rounded-2xl border border-amber-100 bg-amber-50/60 px-6 py-12 text-center"
          role="status"
        >
          <FileWarning className="mb-3 h-10 w-10 text-amber-500" aria-hidden />
          <p className="text-sm font-medium text-amber-900">아직 표시할 뉴스가 없습니다.</p>
          <p className="mt-2 max-w-md text-xs text-amber-800/80">
            Supabase{" "}
            <code className="rounded bg-amber-100/70 px-1 text-[11px]">disclosures</code> 테이블에 AI 요약
            레코드를 넣으면 여기에 순서대로 나타납니다.
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
