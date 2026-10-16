"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/components/i18n/I18nProvider";
import { reclaimOddsUrl } from "@/lib/us-market/washout-chart-url";

type CardRow = {
  ticker: string;
  name: string;
  reclaimPct: number;
  nextPct: number;
  nextEdge: number | null;
  risePct?: number;
};

function byCurrentRise(cards: CardRow[]): CardRow[] {
  if (cards.every((row) => row.risePct == null)) return cards;
  return [...cards].sort((a, b) => {
    const diff = (b.risePct ?? -Infinity) - (a.risePct ?? -Infinity);
    if (diff !== 0) return diff;
    return a.ticker.localeCompare(b.ticker);
  });
}

type OddsFile = { builtAt?: string; cards?: CardRow[] };

function pct(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0.1%";
  if (n >= 100) return "100%";
  const v = Math.round(n * 10) / 10;
  if (v <= 0) return "0.1%";
  if (v >= 100) return "100%";
  return Number.isInteger(v) ? `${v}%` : `${v.toFixed(1)}%`;
}

export function ReclaimOddsCards() {
  const { t } = useI18n();
  const [cards, setCards] = useState<CardRow[] | null>(null);
  const seen = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(reclaimOddsUrl(), { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled && !seen.current) setCards([]);
          return;
        }
        const json = (await res.json()) as OddsFile;
        if (!cancelled && Array.isArray(json.cards)) {
          seen.current = true;
          setCards(byCurrentRise(json.cards));
        }
      } catch {
        if (!cancelled && !seen.current) setCards([]);
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 1_000);
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return (
    <Card className="border-border">
      <CardContent className="px-4 py-4">
        <p className="text-sm text-muted-foreground">{t("similar.oddsTitle")}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("similar.oddsNote")}</p>
        {cards == null ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("similar.oddsLoading")}</p>
        ) : cards.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("similar.membersEmpty")}</p>
        ) : (
          <ul className="mt-2 max-h-[36rem] space-y-2 overflow-y-auto">
            {cards.map((row) => (
              <li key={row.ticker}>
                <div className="rounded-lg border border-border px-3 py-4">
                  <p className="truncate text-sm font-medium text-foreground">{row.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{row.ticker}</p>
                  <div className="mt-3 flex items-end justify-between gap-4">
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {t("similar.oddsReclaim", { ticker: row.ticker })}
                    </p>
                    <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{pct(row.reclaimPct)}</p>
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-4">
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {row.nextEdge == null
                        ? t("similar.oddsAboveTop", { ticker: row.ticker })
                        : t("similar.oddsNext", { ticker: row.ticker, edge: row.nextEdge })}
                    </p>
                    <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{pct(row.nextPct)}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
