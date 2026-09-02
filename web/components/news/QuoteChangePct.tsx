"use client";

import { useRef } from "react";
import { formatChangePct } from "@/lib/quotes/format";
import { hideSplitDistortedPct } from "@/lib/quotes/split-adjusted";

export function QuoteChangePct({
  changePct,
  lastPrice,
}: {
  changePct: number | null | undefined;
  lastPrice?: number | null;
}) {
  const incoming = hideSplitDistortedPct(changePct, lastPrice);
  const shownRef = useRef<number | null>(incoming ?? null);
  if (incoming != null) shownRef.current = incoming;
  const shown = shownRef.current;
  if (shown == null) return null;
  const up = shown >= 0;
  return (
    <span
      className={`inline-block min-w-[8ch] shrink-0 text-end text-sm tabular-nums ${
        up ? "font-semibold text-rose-600" : "font-semibold text-blue-600"
      }`}
    >
      {formatChangePct(shown)}
    </span>
  );
}
