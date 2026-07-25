"use client";

import { ExternalLink } from "lucide-react";
import type { ReverseSplitHit, ReverseSplitScanResult } from "@/lib/sec/reverse-split-scan";
import { cn } from "@/lib/utils";

type Props = {
  report: ReverseSplitScanResult;
};

function HitTable({
  rows,
  emptyText,
  muted,
}: {
  rows: ReverseSplitHit[];
  emptyText: string;
  muted?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-md bg-input-background px-3 py-4 text-sm text-muted-foreground">
        {emptyText}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[28rem] text-left text-sm">
        <thead className="bg-input-background/80 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2.5 font-medium">공시일</th>
            <th className="px-3 py-2.5 font-medium">종류</th>
            <th className="px-3 py-2.5 font-medium">비율</th>
            <th className="px-3 py-2.5 font-medium">비고</th>
            <th className="px-3 py-2.5 font-medium">문서</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((h) => (
            <tr
              key={`${h.accessionNumber}-${h.ratioToOne}-${h.counted ? "c" : "x"}`}
              className={cn("border-t border-border", muted && "text-muted-foreground")}
            >
              <td className="whitespace-nowrap px-3 py-2.5">{h.filingDate}</td>
              <td className="px-3 py-2.5 font-mono text-xs">{h.form}</td>
              <td className={cn("px-3 py-2.5 font-semibold", muted ? "" : "text-foreground")}>
                {h.ratioLabel}
              </td>
              <td className="px-3 py-2.5 text-xs">
                {h.isEffectiveExecution ? (
                  <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-800">
                    Effective / split-adjusted
                  </span>
                ) : h.excludeReason ? (
                  <span className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-800">
                    {h.excludeReason}
                  </span>
                ) : (
                  <span className="text-muted-foreground">합산</span>
                )}
              </td>
              <td className="px-3 py-2.5">
                <a
                  href={h.viewerUrl || h.documentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-foreground underline-offset-2 hover:underline"
                >
                  EDGAR
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminReverseSplitReport({ report }: Props) {
  const countedCount = report.hits.length;
  const excludedCount = report.excludedHits?.length ?? 0;

  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-6"
      aria-live="polite"
    >
      <header className="mb-4 border-b border-border pb-3">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          SEC EDGAR · Reverse Split 한도 리포트
        </p>
        <h2 className="mt-1 text-lg font-semibold text-foreground">
          {report.companyName}{" "}
          <span className="font-mono text-base text-muted-foreground">({report.ticker})</span>
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          최근 {report.lookbackYears}년 · 후보 공시 {report.filingsScanned}건 중{" "}
          {report.filingsFetched}건 본문 조회 · 합산 {countedCount}건
          {excludedCount > 0 ? ` · 중복 제외 ${excludedCount}건` : ""} · CIK {report.cikPadded}
        </p>
      </header>

      <div className="mb-5 space-y-2">
        <p className="text-sm text-foreground">
          <span className="font-medium">누적 병합 비율:</span>{" "}
          {countedCount === 0 ? "1대 1 (이력 없음)" : `${report.cumulativeRatio}대 1`}
        </p>
        <p
          className={cn(
            "text-sm font-semibold",
            report.blocked ? "text-red-600" : "text-foreground"
          )}
        >
          {report.blocked ? report.statusMessage : report.remainingMessage}
        </p>
        {!report.blocked && countedCount > 0 ? (
          <p className="text-sm text-muted-foreground">{report.statusMessage}</p>
        ) : null}
        {report.blocked ? (
          <p className="text-sm text-red-600/90">{report.remainingMessage}</p>
        ) : null}
        {!report.blocked && countedCount === 0 ? (
          <p className="text-sm font-medium text-emerald-700">{report.remainingMessage}</p>
        ) : null}
      </div>

      <div className="space-y-6">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-foreground">
            합산된 병합 공시 ({countedCount})
          </h3>
          <HitTable
            rows={report.hits}
            emptyText="최근 2년 8-K/6-K 본문에서 reverse stock split(1-for-N) 비율을 찾지 못했습니다."
          />
        </div>

        {excludedCount > 0 ? (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-foreground">
              (중복 안건 제외됨) ({excludedCount})
            </h3>
            <p className="mb-2 text-xs text-muted-foreground">
              동일 비율·제출일 45일 이내 공시는 하나의 병합 이벤트로 보고, Effective Date /
              split-adjusted 문서를 우선해 1건만 합산합니다.
            </p>
            <HitTable
              rows={report.excludedHits}
              emptyText=""
              muted
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
