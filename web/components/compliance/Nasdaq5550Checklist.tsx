"use client";

import { useState } from "react";
import { Check, ChevronDown, ExternalLink, X } from "lucide-react";
import {
  formatBidPriceDetectedLabel,
  formatShelfUsd,
  isRule5550aPass,
  isRule5550bPass,
  rule5550aItems,
  rule5550bItems,
  type Nasdaq5550Record,
  type RuleCheckItem,
} from "@/lib/nasdaq-5550-mock";
import type { ShelfCapacitySnapshot, ShelfFilingView } from "@/lib/companies/registered-capacity";
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

function CheckRow({
  item,
  showDetectedDate,
  showFilingLink,
}: {
  item: RuleCheckItem;
  showDetectedDate?: boolean;
  showFilingLink?: boolean;
}) {
  const detected = showDetectedDate ? formatBidPriceDetectedLabel(item) : null;
  const hasOfferingHit =
    item.key === "offering" && item.detectedDates != null && item.detectedDates.length > 0;

  return (
    <li
      className={cn(
        "flex flex-col gap-2 rounded-lg border px-3 py-3 sm:flex-row sm:items-start sm:gap-3 sm:px-4",
        item.status
          ? hasOfferingHit
            ? "border-amber-500/40 bg-amber-500/10"
            : "border-emerald-500/40 bg-emerald-500/10"
          : "border-rose-500/40 bg-rose-500/10"
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <StatusIcon ok={item.status} />
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-sm font-medium leading-snug",
              item.status
                ? hasOfferingHit
                  ? "text-amber-200"
                  : "text-emerald-300"
                : "text-rose-300"
            )}
          >
            {item.label}
          </p>
          <p className="mt-1 text-xs text-slate-400">{item.detail}</p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 font-mono text-xs font-bold",
            item.status
              ? hasOfferingHit
                ? "text-amber-300"
                : "text-emerald-400"
              : "text-rose-400"
          )}
        >
          {item.status ? "O" : "X"}
        </span>
      </div>

      {detected ? (
        <div className="shrink-0 rounded-md border border-slate-600 bg-slate-800/80 px-3 py-2 sm:min-w-[14rem] sm:max-w-[18rem] sm:text-right">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
            {item.key === "bidPrice"
              ? item.eventKind === "deadline"
                ? "마감일"
                : item.eventKind === "notice"
                  ? "통보일"
                  : "1달러 통보"
              : "감지된 공시일"}
          </p>
          <p
            className={cn(
              "mt-0.5 text-sm leading-snug",
              detected.tone === "alert" && "font-semibold text-rose-300",
              detected.tone === "clear" && "font-medium text-emerald-400/90",
              detected.tone === "idle" && "text-slate-500",
              item.key === "offering" && hasOfferingHit && "font-semibold text-amber-200"
            )}
          >
            {item.key === "offering" && hasOfferingHit
              ? `감지된 공시일: ${detected.datesLine}`
              : detected.datesLine}
          </p>
          {detected.note ? (
            <p className="mt-0.5 text-[11px] text-slate-400">{detected.note}</p>
          ) : null}
          {item.key === "bidPrice" && item.daysRemaining != null ? (
            <p
              className={cn(
                "mt-1 text-sm font-semibold",
                item.daysRemaining >= 0 ? "text-rose-200" : "text-slate-400"
              )}
            >
              {item.daysRemaining >= 0
                ? `${item.daysRemaining}일 남음`
                : `${Math.abs(item.daysRemaining)}일 경과`}
            </p>
          ) : null}
          {showFilingLink && item.filingUrl ? (
            <a
              href={item.filingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 rounded border border-slate-500 bg-slate-900/60 px-2 py-1 text-[11px] font-medium text-slate-200 transition-colors hover:border-slate-300 hover:text-white"
            >
              원문 공시 보기
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function shelfKind(snap: ShelfCapacitySnapshot | null | undefined): "wksi" | "active" | "none" {
  if (!snap) return "none";
  if (snap.isUnlimitedShelf) return "wksi";
  if ((snap.totalRegisteredOfferingCapacity ?? 0) > 0) return "active";
  return "none";
}

function ShelfOfferingCard({ record }: { record: Nasdaq5550Record }) {
  const [open, setOpen] = useState(false);
  const snap = record.shelfCapacity ?? null;
  const kind = shelfKind(snap);
  const asrForm =
    snap?.filings.find((f) => f.isActive && (f.formType === "S-3ASR" || f.formType === "F-3ASR"))
      ?.formType ?? (snap?.issuerType === "FOREIGN" ? "F-3ASR" : "S-3ASR");
  const amount = snap?.totalRegisteredOfferingCapacity ?? 0;
  const filings = snap?.filings ?? [];

  const theme =
    kind === "wksi"
      ? {
          box: "border-violet-500/40 bg-violet-500/10",
          title: "text-violet-200",
          badge: "border-violet-400/60 bg-violet-500/20 text-violet-200",
          amount: "text-violet-100",
        }
      : kind === "active"
        ? {
            box: "border-amber-500/40 bg-amber-500/10",
            title: "text-amber-200",
            badge: "border-amber-400/60 bg-amber-500/20 text-amber-200",
            amount: "text-amber-100",
          }
        : {
            box: "border-emerald-500/40 bg-emerald-500/10",
            title: "text-emerald-300",
            badge: "border-emerald-400/60 bg-emerald-500/20 text-emerald-300",
            amount: "text-emerald-200",
          };

  return (
    <li className={cn("rounded-lg border px-3 py-3 sm:px-4", theme.box)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <StatusIcon ok />
          <div className="min-w-0 flex-1">
            <p className={cn("text-sm font-medium leading-snug", theme.title)}>
              {record.offering.label}
            </p>
            <span
              className={cn(
                "mt-2 inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-wide",
                theme.badge
              )}
            >
              {kind === "wksi"
                ? "WKSI 대형 우량주"
                : kind === "active"
                  ? "선반 등록 유효"
                  : "선반 미보유 / 만료"}
            </span>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              {kind === "wksi"
                ? "SEC 사전 승인 절차 없이 수시 발행이 가능한 WKSI 기업입니다."
                : kind === "active"
                  ? "향후 최대 3년간 발행 가능한 신주 공모 총한도입니다."
                  : "최근 3년 내 활성화된 S-1/S-3 선반 등록이 없습니다."}
            </p>
          </div>
        </div>
        <div className="shrink-0 rounded-md border border-slate-600 bg-slate-800/80 px-3 py-2 sm:min-w-[14rem] sm:text-right">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
            Registered Shelf Capacity
          </p>
          <p className={cn("mt-0.5 text-sm font-semibold leading-snug", theme.amount)}>
            {kind === "wksi" ? `무제한 (${asrForm} 등록)` : formatShelfUsd(amount)}
          </p>
        </div>
      </div>

      {filings.length > 0 ? (
        <div className="mt-3 border-t border-slate-700/80 pt-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-300 hover:text-white"
            aria-expanded={open}
          >
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")}
              aria-hidden
            />
            세부 공시 {filings.length}건
          </button>
          {open ? <ShelfFilingsTable filings={filings} /> : null}
        </div>
      ) : null}
    </li>
  );
}

function statusLabel(row: ShelfFilingView): string {
  if (row.status === "REPLACED") return "대체됨";
  if (row.status === "EXPIRED") return "만료";
  return "Active";
}

function ShelfFilingsTable({ filings }: { filings: ShelfFilingView[] }) {
  return (
    <div className="mt-2 overflow-x-auto rounded-md border border-slate-700">
      <table className="w-full min-w-[36rem] text-left text-[11px] text-slate-300">
        <thead className="bg-slate-800/90 text-[10px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-2 py-1.5 font-medium">서식</th>
            <th className="px-2 py-1.5 font-medium">효력발생일</th>
            <th className="px-2 py-1.5 font-medium">등록번호</th>
            <th className="px-2 py-1.5 font-medium">등록금액</th>
            <th className="px-2 py-1.5 font-medium">상태</th>
          </tr>
        </thead>
        <tbody>
          {filings.map((row) => {
            const replaced = row.status === "REPLACED";
            return (
              <tr
                key={`${row.fileNumber}-${row.effectDate}`}
                className={cn(
                  "border-t border-slate-700/70",
                  replaced && "text-slate-500 line-through decoration-slate-500"
                )}
              >
                <td className="px-2 py-1.5 font-mono">
                  {row.filingUrl ? (
                    <a
                      href={row.filingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        "inline-flex items-center gap-1 hover:text-white",
                        replaced && "no-underline"
                      )}
                    >
                      {row.formType}
                      <ExternalLink className="h-3 w-3 opacity-60" aria-hidden />
                    </a>
                  ) : (
                    row.formType
                  )}
                </td>
                <td className="px-2 py-1.5 font-mono">{row.effectDate || "—"}</td>
                <td className="px-2 py-1.5 font-mono">{row.fileNumber}</td>
                <td className="px-2 py-1.5 font-mono">
                  {row.formType === "S-3ASR" || row.formType === "F-3ASR"
                    ? "—"
                    : row.maxOfferingAmount != null
                      ? formatShelfUsd(row.maxOfferingAmount)
                      : "—"}
                </td>
                <td className="px-2 py-1.5">
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-semibold no-underline",
                      replaced
                        ? "bg-slate-700 text-slate-300"
                        : row.status === "EXPIRED"
                          ? "bg-slate-800 text-slate-400"
                          : "bg-emerald-500/15 text-emerald-300"
                    )}
                  >
                    {statusLabel(row)}
                  </span>
                  {replaced && row.replacedByFileNumber ? (
                    <span className="ml-1 text-[10px] no-underline text-slate-500">
                      → {row.replacedByFileNumber}
                    </span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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
              showFilingLink={item.key === "bidPrice"}
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

      <section>
        <div className="mb-3">
          <h3 className="text-base font-semibold text-white">(c) 종목 분석</h3>
          <p className="mt-1 text-sm text-slate-400">
            최근 3년 유효 선반(Registered Shelf Capacity)과 S-3/F-3 공시로
            유상증자(오퍼링) 가능성을 점검합니다.
          </p>
        </div>
        <ul className="space-y-2">
          <ShelfOfferingCard record={record} />
        </ul>
      </section>
    </div>
  );
}
