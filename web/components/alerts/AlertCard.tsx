"use client";

import { Trash2 } from "lucide-react";
import { ALERT_STATUS_LABEL } from "@/lib/alerts/status";
import type { DilutionAlertDto } from "@/lib/alerts/types";
import { cn } from "@/lib/utils";
import { AlertTickerSearch, type TickerHit } from "./AlertTickerSearch";
import { AlertToggle } from "./AlertToggle";

type AlertCardProps = {
  alert: DilutionAlertDto;
  canDelete: boolean;
  busy?: boolean;
  onSelectTicker: (hit: TickerHit) => void;
  onToggle: (enabled: boolean) => void;
  onDelete?: () => void;
};

function statusClass(status: DilutionAlertDto["status"]): string {
  if (status === "watching") {
    return "border-emerald-500/30 bg-emerald-500/15 text-emerald-300";
  }
  if (status === "sent_today") {
    return "border-amber-500/30 bg-amber-500/15 text-amber-300";
  }
  return "border-zinc-600 bg-zinc-800 text-zinc-400";
}

export function AlertCard({
  alert,
  canDelete,
  busy,
  onSelectTicker,
  onToggle,
  onDelete,
}: AlertCardProps) {
  return (
    <article
      className={cn(
        "rounded-2xl border border-zinc-800 bg-zinc-900/90 p-4 shadow-sm",
        alert.enabled && alert.status === "watching" && "border-emerald-500/20"
      )}
    >
      <AlertTickerSearch
        ticker={alert.ticker}
        companyName={alert.companyName}
        disabled={busy}
        onSelect={onSelectTicker}
      />

      <div className="mt-4 flex items-center gap-3">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
            statusClass(alert.status)
          )}
        >
          {ALERT_STATUS_LABEL[alert.status]}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {canDelete ? (
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-800 hover:text-red-400 disabled:opacity-40"
              aria-label="알람 삭제"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : null}
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
