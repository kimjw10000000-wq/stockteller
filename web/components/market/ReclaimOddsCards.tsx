"use client";

import { useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/components/i18n/I18nProvider";
import { ReclaimOddsList } from "@/components/market/ReclaimOddsList";
import { useReclaimWidgetState } from "@/components/market/ReclaimOddsWidget";
import { closeReclaimWidget, openReclaimWidget, watchReclaimOdds } from "@/lib/us-market/reclaim-widget";

export function ReclaimOddsCards() {
  const { t } = useI18n();
  const { cards, mode } = useReclaimWidgetState();
  const floating = mode !== "off";

  useEffect(() => watchReclaimOdds(), []);

  return (
    <Card className="border-border">
      <CardContent className="px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">{t("similar.oddsTitle")}</p>
          <button
            type="button"
            aria-pressed={floating}
            onClick={() => (floating ? closeReclaimWidget() : openReclaimWidget())}
            className={
              floating
                ? "min-h-8 shrink-0 rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background"
                : "min-h-8 shrink-0 rounded-full border border-foreground/30 px-3 py-1 text-xs font-medium text-foreground"
            }
          >
            {floating ? t("similar.oddsFloatClose") : t("similar.oddsFloat")}
          </button>
        </div>
        <ReclaimOddsList cards={cards} className="mt-2 max-h-80" />
      </CardContent>
    </Card>
  );
}
