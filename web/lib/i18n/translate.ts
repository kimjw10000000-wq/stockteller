import ko from "@/locales/ko.json";
import en from "@/locales/en.json";
import { type Locale } from "@/lib/i18n/config";

export type Messages = typeof ko;
export type MessageKey = string;

export const MESSAGES: Record<Locale, Messages> = { ko, en };

export type TranslateValues = Record<string, string | number>;

export function translate(
  locale: Locale,
  key: string,
  values?: TranslateValues
): string {
  const found = lookup(MESSAGES[locale], key) ?? lookup(MESSAGES.ko, key);
  if (found == null) return key;
  if (!values) return found;
  return found.replace(/\{(\w+)\}/g, (_, name: string) =>
    values[name] == null ? `{${name}}` : String(values[name])
  );
}

function lookup(tree: unknown, key: string): string | null {
  let cur: unknown = tree;
  for (const part of key.split(".")) {
    if (typeof cur !== "object" || cur === null || !(part in cur)) return null;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === "string" ? cur : null;
}

export function hasMessage(key: string): boolean {
  return lookup(MESSAGES.ko, key) != null;
}
