import { formatChangePct } from "@/lib/quotes/format";

export function QuoteChangePct({ changePct }: { changePct: number | null | undefined }) {
  if (changePct == null || !Number.isFinite(changePct)) return null;
  const up = changePct >= 0;
  return (
    <span
      className={`tabular-nums text-sm ${up ? "font-semibold text-rose-600" : "font-medium text-blue-600"}`}
    >
      {formatChangePct(changePct)}
    </span>
  );
}
