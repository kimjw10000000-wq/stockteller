"use client";

import { useEffect, useId, useRef } from "react";
import Link from "next/link";
import { X } from "lucide-react";

type UpgradeModalProps = {
  open: boolean;
  onClose: () => void;
};

export function UpgradeModal({ open, onClose }: UpgradeModalProps) {
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
        className="absolute inset-0 bg-black/40"
        aria-label="닫기"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-md"
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="닫기"
        >
          <X className="h-4 w-4" />
        </button>
        <p className="text-xs font-medium uppercase tracking-wider text-green-600">Pro</p>
        <h2 id={titleId} className="mt-2 text-lg font-semibold text-foreground">
          무제한 종목 알람을 등록하려면 Pro 플랜으로 업그레이드하세요
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          무료 플랜은 알람 슬롯 1개, 미국 동부 04:00 기준 하루 1회 발송입니다. Pro는 종목을 제한 없이
          감시할 수 있습니다.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
          <Link
            href="/pricing"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-white hover:bg-emerald-600"
          >
            업그레이드
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-accent"
          >
            나중에
          </button>
        </div>
      </div>
    </div>
  );
}
