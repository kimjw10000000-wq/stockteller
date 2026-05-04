import Link from "next/link";
import { ChevronRight, Clock } from "lucide-react";
import type { DisclosureWithStock } from "@/lib/types";
import { SentimentBadge } from "@/components/SentimentBadge";

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("ko-KR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return iso;
  }
}

type DisclosureCardProps = {
  item: DisclosureWithStock;
};

export function DisclosureCard({ item }: DisclosureCardProps) {
  const name = item.stocks?.name ?? "종목 미상";
  const ticker = item.stocks?.ticker ?? "—";
  const title = item.title ?? "제목 없음";
  const preview = item.summary?.split("\n").filter(Boolean)[0] ?? "";

  return (
    <Link
      href={`/disclosure/${item.id}`}
      className="group block rounded-2xl border border-slate-100 bg-white p-5 shadow-sm shadow-slate-100/80 transition hover:border-blue-100 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[#3182f6]">
            {name}
            <span className="ml-2 font-mono text-xs font-normal text-slate-400">{ticker}</span>
          </p>
          <h2 className="mt-1 text-base font-semibold leading-snug text-slate-900 group-hover:text-[#1b64da] sm:text-lg">
            {title}
          </h2>
          {preview ? (
            <p className="mt-2 line-clamp-2 text-sm text-slate-500">{preview}</p>
          ) : null}
        </div>
        <ChevronRight
          className="mt-1 h-5 w-5 shrink-0 text-slate-300 transition group-hover:text-[#3182f6]"
          aria-hidden
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <SentimentBadge sentiment={item.sentiment} />
        <span className="inline-flex items-center gap-1 text-xs text-slate-400">
          <Clock className="h-3.5 w-3.5" aria-hidden />
          {formatTime(item.created_at)}
        </span>
      </div>
    </Link>
  );
}
