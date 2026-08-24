"use client";

import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/components/i18n/I18nProvider";

export function SimilarMoversContent() {
  const { t } = useI18n();
  return (
    <main className="space-y-6">
      <header>
        <p className="text-sm font-medium text-muted-foreground">{t("similar.kicker")}</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground sm:text-3xl">{t("similar.title")}</h1>
      </header>

      <Card className="border-border">
        <CardContent>
          <p className="text-base font-medium text-foreground">{t("similar.pendingTitle")}</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("similar.pendingBody")}</p>
        </CardContent>
      </Card>
    </main>
  );
}
