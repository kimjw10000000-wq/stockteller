"use client";

import { Lock, Plus } from "lucide-react";
import { ALERT_STATUS_LABEL } from "@/lib/alerts/status";
import type { DilutionAlertDto } from "@/lib/alerts/types";
import { cn } from "@/lib/utils";
import { AlertToggle } from "./AlertToggle";

type AlertCardProps = {
  alert: DilutionAlertDto;
  busy?: boolean;
  onChangeTicker: () => void;
  onToggle: (enabled: boolean) => void;
};

function statusClass(status: DilutionAlertDto["status"]): string {
  if (status === "watching") {
    return "border-sky-300 bg-sky-100 text-sky-800";
  }
  if (status === "sent_today") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  return "border-slate-200 bg-slate-50 text-slate-500";
}

export function AlertCard({ alert, busy, onChangeTicker, onToggle }: AlertCardProps) {
  return (
    <article
      className={cn(
        "flex h-full min-h-[240px] flex-col rounded-2xl border-2 border-sky-500 bg-white/90 p-5 shadow-sm backdrop-blur-sm",
        alert.enabled && alert.status === "watching" && "border-sky-600 shadow-sky-200"
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-2xl font-semibold tracking-wide text-slate-900">
            {alert.ticker || "종목 선택"}
          </p>
          <p className="mt-1 truncate text-sm text-slate-500">
            {alert.companyName || "티커를 검색해 등록하세요"}
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={onChangeTicker}
          className="shrink-0 text-sm font-medium text-sky-600 hover:text-sky-800 disabled:opacity-40"
        >
          변경
        </button>
      </div>

      <div className="mt-auto flex items-center gap-3 pt-8">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
            statusClass(alert.status)
          )}
        >
          {ALERT_STATUS_LABEL[alert.status]}
        </span>
        <div className="ml-auto">
          <AlertToggle
            checked={alert.enabled}
            disabled={busy}
            onChange={onToggle}
            label={`${alert.ticker ?? "알람"} 활성화`}
          />
        </div>
      </div>
    </article>
  );
}

type LockedSlotCardProps = {
  onClick: () => void;
};

export function LockedSlotCard({ onClick }: LockedSlotCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex h-full min-h-[240px] w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-sky-500/70 bg-white/55 p-5 text-center shadow-sm transition-colors hover:border-sky-600 hover:bg-white/85"
    >
      <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full border border-sky-400 bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700">
        <Lock className="h-3 w-3" aria-hidden />
        Pro
      </span>
      <Plus className="h-10 w-10 text-sky-500" strokeWidth={1.75} aria-hidden />
      <p className="mt-3 text-sm font-medium text-slate-600">Pro 전용 슬롯</p>
      <p className="mt-1 text-xs text-slate-400">알람 추가</p>
    </button>
  );
}

type EmptySlotCardProps = {
  busy?: boolean;
  onClick: () => void;
};

export function EmptySlotCard({ busy, onClick }: EmptySlotCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="flex h-full min-h-[240px] w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-sky-500 bg-white/70 p-5 text-center shadow-sm transition-colors hover:border-sky-600 hover:bg-white disabled:opacity-50"
    >
      <Plus className="h-10 w-10 text-sky-500" strokeWidth={1.75} aria-hidden />
      <p className="mt-3 text-sm font-medium text-slate-600">알람 추가</p>
    </button>
  );
}
