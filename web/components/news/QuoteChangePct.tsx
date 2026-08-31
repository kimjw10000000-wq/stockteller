import { formatChangePct } from "@/lib/quotes/format";
import { hideSplitDistortedPct } from "@/lib/quotes/split-adjusted";

export function QuoteChangePct({
  changePct,
  lastPrice,
}: {
  changePct: number | null | undefined;
  lastPrice?: number | null;
}) {
  const pct = hideSplitDistortedPct(changePct, lastPrice);
  if (pct == null) return null;
  const up = pct >= 0;
  return (
    <span
      className={`tabular-nums text-sm ${up ? "font-semibold text-rose-600" : "font-medium text-blue-600"}`}
    >
      {formatChangePct(pct)}
    </span>
  );
}
