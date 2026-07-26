"use client";

import { Check, X } from "lucide-react";
import {
  isRule5550aPass,
  isRule5550bPass,
  rule5550aItems,
  rule5550bItems,
  type Nasdaq5550Record,
  type RuleCheckItem,
} from "@/lib/nasdaq-5550-mock";
import { cn } from "@/lib/utils";

function StatusIcon({ ok }: { ok: boolean }) {
  return ok ? (
    <span
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-emerald-500 bg-emerald-500/10 text-emerald-400"
      aria-label="충족"
    >
      <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
    </span>
  ) : (
    <span
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-rose-500 bg-rose-500/10 text-rose-400"
      aria-label="미충족"
    >
      <X className="h-4 w-4" strokeWidth={2.5} aria-hidden />
    </span>
  );
}

function CheckRow({ item, showDetectedDate }: { item: RuleCheckItem; showDetectedDate?: boolean }) {
  const dateLabel = item.detectedDate
    ? item.detectedDate
    : showDetectedDate
      ? "검색 대기 중"
      : "—";

  return (
    <li
      className={cn(
        "flex flex-col gap-2 rounded-lg border px-3 py-3 sm:flex-row sm:items-start sm:gap-3 sm:px-4",
        item.status
          ? "border-emerald-500/40 bg-emerald-500/10"
          : "border-rose-500/40 bg-rose-500/10"
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <StatusIcon ok={item.status} />
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-sm font-medium leading-snug",
              item.status ? "text-emerald-300" : "text-rose-300"
            )}
          >
            {item.label}
          </p>
          <p className="mt-1 text-xs text-slate-400">{item.detail}</p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 font-mono text-xs font-bold",
            item.status ? "text-emerald-400" : "text-rose-400"
          )}
        >
          {item.status ? "O" : "X"}
        </span>
      </div>

      {(showDetectedDate || item.detectedDate) && (
        <div className="shrink-0 rounded-md border border-slate-600 bg-slate-800/80 px-3 py-2 sm:min-w-[11rem] sm:text-right">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
            감지된 공시일
          </p>
          <p
            className={cn(
              "mt-0.5 font-mono text-sm",
              item.detectedDate ? "font-semibold text-rose-300" : "text-slate-500"
            )}
          >
            {dateLabel}
          </p>
          {item.detectedNote ? (
            <p className="mt-0.5 text-[11px] text-slate-400">{item.detectedNote}</p>
          ) : null}
        </div>
      )}
    </li>
  );
}

type Props = {
  record: Nasdaq5550Record;
  loading?: boolean;
};

export function Nasdaq5550Checklist({ record, loading }: Props) {
  const aItems = rule5550aItems(record);
  const bItems = rule5550bItems(record);
  const aPass = isRule5550aPass(record);
  const bPass = isRule5550bPass(record);
  const bPassCount = bItems.filter((i) => i.status).length;

  return (
    <div className={cn("space-y-6 text-white", loading && "opacity-70")}>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-700 pb-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Nasdaq Listing Standards
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
            {record.companyName}
          </h2>
          <p className="mt-1 font-mono text-sm text-slate-300">{record.ticker}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-semibold",
              aPass
                ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                : "border-rose-500 bg-rose-500/10 text-rose-400"
            )}
          >
            5550(a) {aPass ? "PASS" : "FAIL"}
          </span>
          <span
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-semibold",
              bPass
                ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                : "border-rose-500 bg-rose-500/10 text-rose-400"
            )}
          >
            5550(b) {bPass ? "PASS" : "FAIL"}
          </span>
        </div>
      </div>

      <section>
        <div className="mb-3">
          <h3 className="text-base font-semibold text-white">
            (a) 주요 주식 증권에 대한 지속적인 상장 요건
          </h3>
          <p className="mt-1 text-sm text-slate-400">
            Rule 5550(a)의 5가지 항목은 모두(AND) 충족해야 상장이 유지됩니다.
          </p>
        </div>
        <ul className="space-y-2">
          {aItems.map((item) => (
            <CheckRow
              key={item.key}
              item={item}
              showDetectedDate={item.key === "bidPrice"}
            />
          ))}
        </ul>
        <p
          className={cn(
            "mt-3 rounded-md border px-3 py-2 text-sm font-medium",
            aPass
              ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
              : "border-rose-500 bg-rose-500/10 text-rose-400"
          )}
        >
          {aPass
            ? "a항목 기준 충족 (5개 항목 모두 달성)"
            : "a항목 기준 위반 (필수 항목 중 미달 존재)"}
        </p>
      </section>

      <section>
        <div className="mb-3">
          <h3 className="text-base font-semibold text-white">
            (b) 주요 주식 증권에 대한 지속적인 상장 기준
          </h3>
          <p className="mt-1 text-sm text-slate-400">
            Rule 5550(b)의 3가지 항목 중 최소 1개(OR) 이상을 충족해야 합니다.
          </p>
        </div>
        <ul className="space-y-2">
          {bItems.map((item) => (
            <CheckRow key={item.key} item={item} />
          ))}
        </ul>
        <p
          className={cn(
            "mt-3 rounded-md border px-3 py-2 text-sm font-semibold",
            bPass
              ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
              : "border-rose-500 bg-rose-500/10 text-rose-400"
          )}
          role="status"
        >
          {bPass
            ? `🟢 b항목 기준 충족 (1개 이상 달성 · ${bPassCount}/3)`
            : "🔴 b항목 기준 위반 (3개 항목 모두 미달)"}
        </p>
      </section>
    </div>
  );
}
