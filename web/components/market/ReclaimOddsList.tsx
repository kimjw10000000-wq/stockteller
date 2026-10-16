"use client";

import { useI18n } from "@/components/i18n/I18nProvider";
import { cardDisplayName, pctLabel, type ReclaimCard } from "@/lib/us-market/reclaim-widget";

export function ReclaimOddsList({ cards, className }: { cards: ReclaimCard[] | null; className?: string }) {
  const { t, locale } = useI18n();
  if (cards == null) {
    return <p className="mt-2 text-sm text-muted-foreground">{t("similar.oddsLoading")}</p>;
  }
  if (cards.length === 0) {
    return <p className="mt-2 text-sm text-muted-foreground">{t("similar.membersEmpty")}</p>;
  }
  return (
    <ul className={`space-y-2 overflow-y-auto ${className ?? ""}`}>
      {cards.map((row) => (
        <li key={row.ticker}>
          <div className="rounded-lg border-2 border-foreground/40 px-3 py-2">
            <p className="text-sm font-medium leading-snug text-foreground">{cardDisplayName(row, locale)}</p>
            <p className="font-mono text-xs text-muted-foreground">{row.ticker}</p>
            <p className="mt-2 w-full text-center text-[11px] leading-snug text-muted-foreground">{t("similar.oddsUntil")}</p>
            <div className="mt-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs leading-snug text-muted-foreground">{t("similar.oddsReclaim")}</p>
                <p className="text-sm font-semibold tabular-nums text-foreground">{pctLabel(row.reclaimPct)}</p>
              </div>
              <div className="min-w-0 text-right">
                <p className="text-xs leading-snug text-muted-foreground">
                  {row.nextEdge == null ? t("similar.oddsAboveTop") : t("similar.oddsNext", { edge: row.nextEdge })}
                </p>
                <p className="text-sm font-semibold tabular-nums text-foreground">{pctLabel(row.nextPct)}</p>
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
