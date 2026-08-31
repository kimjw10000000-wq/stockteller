"use client";

import { useI18n } from "@/components/i18n/I18nProvider";
import { formatSeoulDateTime } from "@/lib/i18n/format-seoul-datetime";

export function LocalizedDate({ iso }: { iso: string }) {
  const { locale } = useI18n();
  try {
    return <>{formatSeoulDateTime(iso, locale)}</>;
  } catch {
    return <>{iso}</>;
  }
}
