"use client";

import { useEffect, useId, useRef } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";

type UpgradeModalProps = {
  open: boolean;
  onClose: () => void;
};

export function UpgradeModal({ open, onClose }: UpgradeModalProps) {
  const { t } = useI18n();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-sky-950/30"
        aria-label={t("alerts.close")}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-md rounded-2xl border-2 border-sky-400 bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-400 hover:bg-sky-50 hover:text-slate-700"
          aria-label={t("alerts.close")}
        >
          <X className="h-4 w-4" />
        </button>
        <p className="text-xs font-medium uppercase tracking-wider text-sky-600">
          {t("alerts.upgradeKicker")}
        </p>
        <h2 id={titleId} className="mt-2 text-lg font-semibold text-slate-900">
          {t("alerts.upgradeTitle")}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-900">{t("alerts.upgradeBody")}</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
          <Link
            href="/pricing"
            prefetch
            className="inline-flex h-11 items-center justify-center rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700"
          >
            {t("alerts.upgradeCta")}
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center justify-center rounded-xl border-2 border-sky-400 bg-white px-4 text-sm font-medium text-slate-900 hover:bg-sky-50"
          >
            {t("alerts.upgradeLater")}
          </button>
        </div>
      </div>
    </div>
  );
}
