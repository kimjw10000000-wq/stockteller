"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/components/i18n/I18nProvider";
import { reclaimOddsUrl } from "@/lib/us-market/washout-chart-url";

type CardRow = {
  ticker: string;
  name: string;
  nameKo?: string;
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
  const { t, locale } = useI18n();
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
        {cards == null ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("similar.oddsLoading")}</p>
        ) : cards.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("similar.membersEmpty")}</p>
        ) : (
          <ul className="mt-2 max-h-80 space-y-2 overflow-y-auto">
            {cards.map((row) => (
              <li key={row.ticker}>
                <div className="rounded-lg border-2 border-foreground/40 px-3 py-2">
                  <p className="text-sm font-medium leading-snug text-foreground">
                    {locale === "ko" && row.nameKo ? row.nameKo : row.name}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">{row.ticker}</p>
                  <p className="mt-2 w-full text-center text-[11px] leading-snug text-muted-foreground">{t("similar.oddsUntil")}</p>
                  <div className="mt-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs leading-snug text-muted-foreground">{t("similar.oddsReclaim")}</p>
                      <p className="text-sm font-semibold tabular-nums text-foreground">{pct(row.reclaimPct)}</p>
                    </div>
                    <div className="min-w-0 text-right">
                      <p className="text-xs leading-snug text-muted-foreground">
                        {row.nextEdge == null
                          ? t("similar.oddsAboveTop")
                          : t("similar.oddsNext", { edge: row.nextEdge })}
                      </p>
                      <p className="text-sm font-semibold tabular-nums text-foreground">{pct(row.nextPct)}</p>
                    </div>
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
