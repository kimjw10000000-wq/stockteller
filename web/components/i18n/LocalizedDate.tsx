"use client";

import { useI18n } from "@/components/i18n/I18nProvider";
import { dateLocale } from "@/lib/i18n/config";

export function LocalizedDate({ iso }: { iso: string }) {
  const { locale } = useI18n();
  try {
    return (
      <>
        {new Intl.DateTimeFormat(dateLocale(locale), {
          timeZone: "Asia/Seoul",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(iso))}
      </>
    );
  } catch {
    return <>{iso}</>;
  }
}
