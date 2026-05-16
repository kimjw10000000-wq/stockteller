import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock } from "lucide-react";
import { AdSlot } from "@/components/AdSlot";
import { SentimentBadge } from "@/components/SentimentBadge";
import { getDisclosureById } from "@/lib/disclosures";
import { isManualEditorPost } from "@/lib/manual-post";
import { SITE_NAME_KO } from "@/lib/site";

type PageProps = { params: { id: string } };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const row = await getDisclosureById(params.id);
  if (!row) {
    return { title: "공시를 찾을 수 없음" };
  }
  const manual = isManualEditorPost(row);
  const name = manual ? "사이트 소식" : (row.stocks?.name ?? "종목");
  const title = row.title ?? "공시 요약";
  const description = row.summary?.split("\n").filter(Boolean).slice(0, 2).join(" ") ?? "";
  return {
    title: `${name} — ${title}`,
    description: description || `${name} 공시 AI 분석 · ${SITE_NAME_KO}`,
    alternates: {
      canonical: `/disclosure/${params.id}`,
    },
    openGraph: {
      title: `${name} — ${title}`,
      description,
    },
  };
}

function formatTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "long",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default async function DisclosureDetailPage({ params }: PageProps) {
  const row = await getDisclosureById(params.id);
  if (!row) notFound();

  const manual = isManualEditorPost(row);
  const name = manual ? "사이트 소식" : (row.stocks?.name ?? "종목 미상");
  const ticker = manual ? "편집" : (row.stocks?.ticker ?? "—");
  const title = row.title ?? "제목 없음";
  const summaryLines = row.summary
    ? row.summary.split("\n").filter((l) => l.trim())
    : [];

  return (
    <main>
      <nav className="mb-6" aria-label="뒤로">
        <Link
          href="/feed"
          className="inline-flex items-center gap-1 text-sm font-medium text-[#3182f6] hover:text-[#1b64da]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          뉴스 목록
        </Link>
      </nav>

      <AdSlot position="top" />

      <article className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-8">
        <header className="border-b border-slate-100 pb-6">
          <p className="text-sm font-medium text-[#3182f6]">
            {name}{" "}
            <span className="ml-1 font-mono text-xs font-normal text-slate-400">{ticker}</span>
          </p>
          <h1 className="mt-2 text-balance text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {title}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <SentimentBadge sentiment={row.sentiment} />
            {row.analysis_score != null ? (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
                AI 점수 {row.analysis_score}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1 text-xs text-slate-400">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              {formatTime(row.created_at)}
            </span>
          </div>
        </header>

        <section className="mt-8" aria-labelledby="summary-heading">
          <h2 id="summary-heading" className="text-lg font-semibold text-slate-900">
            {manual ? "미리보기" : "AI 핵심 요약"}
          </h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-slate-700">
            {(summaryLines.length ? summaryLines : [
              manual ? "목록 카드에 보이는 미리보기입니다." : "요약이 아직 없습니다.",
            ]).map((line, i) => (
              <li key={i} className="leading-relaxed">
                {line}
              </li>
            ))}
          </ol>
        </section>

        <AdSlot position="middle" />

        <section className="mt-10" aria-labelledby="raw-heading">
          <h2 id="raw-heading" className="text-lg font-semibold text-slate-900">
            {manual ? "본문" : "공시 원문 (발췌)"}
          </h2>
          <pre className="mt-3 max-h-[480px] overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-left text-sm text-slate-600">
            {row.raw_content}
          </pre>
        </section>
      </article>

      <AdSlot position="bottom" />
    </main>
  );
}
