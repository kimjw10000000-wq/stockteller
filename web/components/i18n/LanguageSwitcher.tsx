"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Globe } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { LOCALES, type Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

const LABELS: Record<Locale, { short: string; key: string }> = {
  ko: { short: "KO", key: "header.languageKo" },
  en: { short: "EN", key: "header.languageEn" },
};

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={t("header.language")}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-sm font-medium text-foreground transition-colors",
          "hover:bg-accent hover:text-accent-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/80",
          open && "bg-sky-50 ring-1 ring-sky-300"
        )}
      >
        <Globe className="h-4 w-4 text-sky-600" aria-hidden />
        <span className="hidden items-center gap-1 sm:inline-flex">
          {LOCALES.map((code, i) => (
            <span key={code} className="inline-flex items-center gap-1">
              {i > 0 ? (
                <span className="text-muted-foreground/50" aria-hidden>
                  |
                </span>
              ) : null}
              <span
                className={cn(
                  "tabular-nums tracking-wide",
                  locale === code ? "font-semibold text-sky-700" : "text-muted-foreground"
                )}
              >
                {LABELS[code].short}
              </span>
            </span>
          ))}
        </span>
        <span className="tabular-nums tracking-wide sm:hidden">{LABELS[locale].short}</span>
      </button>

      {open ? (
        <ul
          id={menuId}
          role="listbox"
          aria-label={t("header.language")}
          className="absolute right-0 z-50 mt-1.5 min-w-[10.5rem] overflow-hidden rounded-xl border border-sky-200/80 bg-white py-1 shadow-lg shadow-sky-900/10"
        >
          {LOCALES.map((code) => {
            const selected = locale === code;
            return (
              <li key={code} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => {
                    setLocale(code);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors",
                    selected
                      ? "bg-sky-50 font-semibold text-sky-800"
                      : "text-slate-700 hover:bg-sky-50/70"
                  )}
                >
                  <span>
                    <span className="mr-2 font-mono text-xs text-sky-600">{LABELS[code].short}</span>
                    {t(LABELS[code].key)}
                  </span>
                  {selected ? <Check className="h-3.5 w-3.5 text-sky-600" aria-hidden /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
