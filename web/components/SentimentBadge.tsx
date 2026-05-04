import type { Sentiment } from "@/lib/types";

const config: Record<
  Sentiment,
  { label: string; className: string }
> = {
  positive: {
    label: "긍정",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  },
  negative: {
    label: "부정",
    className: "bg-rose-50 text-rose-700 ring-rose-100",
  },
  neutral: {
    label: "중립",
    className: "bg-slate-100 text-slate-600 ring-slate-200",
  },
};

type SentimentBadgeProps = {
  sentiment: Sentiment | null;
};

export function SentimentBadge({ sentiment }: SentimentBadgeProps) {
  const s = sentiment ?? "neutral";
  const { label, className } = config[s];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${className}`}
    >
      AI · {label}
    </span>
  );
}
