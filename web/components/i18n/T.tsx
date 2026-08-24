"use client";

import { useI18n } from "@/components/i18n/I18nProvider";
import type { TranslateValues } from "@/lib/i18n/translate";

/** 서버 컴포넌트 안에서도 쓸 수 있는 클라이언트 번역 텍스트 */
export function T({
  k,
  values,
}: {
  k: string;
  values?: TranslateValues;
}) {
  const { t } = useI18n();
  return <>{t(k, values)}</>;
}
