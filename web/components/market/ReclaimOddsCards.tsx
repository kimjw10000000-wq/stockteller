"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/components/i18n/I18nProvider";
import { ReclaimOddsList } from "@/components/market/ReclaimOddsList";
import { useReclaimWidgetState } from "@/components/market/ReclaimOddsWidget";
import {
  closeReclaimWidget,
  isHandheldOddsDevice,
  openReclaimWidget,
  primeReclaimWidget,
  watchReclaimOdds,
} from "@/lib/us-market/reclaim-widget";

export function ReclaimOddsCards() {
  const { t } = useI18n();
  const { cards, mode } = useReclaimWidgetState();
  const floating = mode !== "off";
  const [handheld, setHandheld] = useState(false);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => watchReclaimOdds(), []);

  useEffect(() => {
    setHandheld(isHandheldOddsDevice());
  }, []);

  useEffect(() => {
    if (floating) setPicking(false);
  }, [floating]);

  return (
    <Card className="border-border">
      <CardContent className="px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">{t("similar.oddsTitle")}</p>
          {handheld ? (
            <button
              type="button"
              aria-pressed={floating || picking}
              onClick={() => {
                if (floating) {
                  setPicking(false);
                  closeReclaimWidget();
                  return;
                }
                setPicking((on) => {
                if (!on) primeReclaimWidget();
                return !on;
              });
              }}
              className={
                floating || picking
                  ? "min-h-8 shrink-0 rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background"
                  : "min-h-8 shrink-0 rounded-full border border-foreground/30 px-3 py-1 text-xs font-medium text-foreground"
              }
            >
              {floating ? t("similar.oddsFloatClose") : t("similar.oddsFloat")}
            </button>
          ) : null}
        </div>
        {handheld ? (
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("similar.oddsSearch")}
            aria-label={t("similar.oddsSearch")}
            className="mt-2 w-full rounded-lg border border-foreground/20 bg-white px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        ) : null}
        <ReclaimOddsList
          cards={cards}
          query={handheld ? query : ""}
          picking={handheld && picking && !floating}
          onPick={(ticker) => {
            setPicking(false);
            openReclaimWidget(ticker);
          }}
          className="mt-2 max-h-80"
        />
      </CardContent>
    </Card>
  );
}
