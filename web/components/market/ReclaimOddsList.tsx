"use client";

import { useEffect, useRef } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { cardDisplayName, pctLabel, rankReclaimCards, type ReclaimCard } from "@/lib/us-market/reclaim-widget";

function OddsFigures({ row, large = false }: { row: ReclaimCard; large?: boolean }) {
  const { t } = useI18n();
  return (
    <>
      <p
        className={
          large
            ? "mt-3 w-full text-center text-sm leading-snug text-muted-foreground"
            : "mt-2 w-full text-center text-[11px] leading-snug text-muted-foreground"
        }
      >
        {t("similar.oddsUntil")}
      </p>
      <div className={large ? "mt-3 flex items-start justify-between gap-3" : "mt-2 flex items-start justify-between gap-3"}>
        <div className="min-w-0">
          <p className={large ? "text-sm leading-snug text-muted-foreground" : "text-xs leading-snug text-muted-foreground"}>
            {t("similar.oddsReclaim")}
          </p>
          <p className={large ? "text-3xl font-semibold tabular-nums text-foreground" : "text-sm font-semibold tabular-nums text-foreground"}>
            {pctLabel(row.reclaimPct)}
          </p>
        </div>
        <div className="min-w-0 text-right">
          <p className={large ? "text-sm leading-snug text-muted-foreground" : "text-xs leading-snug text-muted-foreground"}>
            {row.nextEdge == null ? t("similar.oddsAboveTop") : t("similar.oddsNext", { edge: row.nextEdge })}
          </p>
          <p className={large ? "text-3xl font-semibold tabular-nums text-foreground" : "text-sm font-semibold tabular-nums text-foreground"}>
            {pctLabel(row.nextPct)}
          </p>
        </div>
      </div>
    </>
  );
}

export function ReclaimOddsFocus({ card }: { card: ReclaimCard | null }) {
  const { t, locale } = useI18n();
  if (!card) {
    return <p className="px-3 pb-3 text-sm text-muted-foreground">{t("similar.membersEmpty")}</p>;
  }
  return (
    <div className="px-3 pb-4">
      <p className="text-xl font-semibold leading-snug text-foreground">{cardDisplayName(card, locale)}</p>
      <p className="mt-1 font-mono text-sm text-muted-foreground">{card.ticker}</p>
      <OddsFigures row={card} large />
    </div>
  );
}

export function ReclaimOddsList({
  cards,
  className,
  query = "",
  picking = false,
  onPick,
}: {
  cards: ReclaimCard[] | null;
  className?: string;
  query?: string;
  picking?: boolean;
  onPick?: (ticker: string) => void;
}) {
  const { t, locale } = useI18n();
  const scroller = useRef<HTMLUListElement>(null);
  const ranked = cards ? rankReclaimCards(cards, query, locale) : null;

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [query]);

  if (cards == null || ranked == null) {
    return <p className="mt-2 text-sm text-muted-foreground">{t("similar.oddsLoading")}</p>;
  }
  if (cards.length === 0) {
    return <p className="mt-2 text-sm text-muted-foreground">{t("similar.membersEmpty")}</p>;
  }
  return (
    <ul ref={scroller} className={`space-y-2 overflow-y-auto ${className ?? ""}`}>
      {ranked.cards.map((row) => {
        const name = cardDisplayName(row, locale);
        const hit = ranked.matched.has(row.ticker);
        return (
          <li key={row.ticker} className="flex items-start gap-2">
            {picking ? (
              <input
                type="checkbox"
                className="mt-3 h-6 w-6 shrink-0 accent-foreground"
                aria-label={name}
                onChange={() => onPick?.(row.ticker)}
              />
            ) : null}
            <div
              className={
                hit
                  ? "min-w-0 flex-1 rounded-lg border-2 border-yellow-500 bg-yellow-200 px-3 py-2"
                  : "min-w-0 flex-1 rounded-lg border-2 border-foreground/40 px-3 py-2"
              }
            >
              <p className="text-sm font-medium leading-snug text-foreground">{name}</p>
              <p className="font-mono text-xs text-muted-foreground">{row.ticker}</p>
              <OddsFigures row={row} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
