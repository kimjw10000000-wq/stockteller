"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { TradeHaltItem } from "@/lib/halts/nasdaq-trade-halts";

type HaltsResponse = {
  items: TradeHaltItem[];
  fetchedAt?: string;
  count?: number;
  error?: string;
};

function formatEtHint(date: string | null, time: string | null): string {
  if (!date && !time) return "미정";
  if (date && time) return `${date} ${time} ET`;
  return `${date || ""} ${time || ""}`.trim() + " ET";
}

export function TradeHaltsPanel() {
  const [items, setItems] = useState<TradeHaltItem[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/halts", { cache: "no-store" });
      const j = (await res.json()) as HaltsResponse;
      if (!res.ok && j.error) {
        setError(j.error);
        setItems([]);
      } else {
        setItems(j.items ?? []);
        setFetchedAt(j.fetchedAt ?? null);
        if (j.error) setError(j.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오기 실패");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  const halted = items.filter((i) => i.status === "halted");
  const resuming = items.filter((i) => i.status === "resuming");

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            NASDAQ Trade Halt RSS · 약 1분마다 갱신
            {fetchedAt ? (
              <span className="ml-2 text-xs">
                마지막 동기화 {new Date(fetchedAt).toLocaleString("ko-KR")}
              </span>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground transition-colors hover:border-primary/50 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          새로고침
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-input-background px-4 py-3">
          <p className="text-xs text-muted-foreground">현재 Halt (재개 시각 미정)</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{halted.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-input-background px-4 py-3">
          <p className="text-xs text-muted-foreground">재개 일정 공지됨</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{resuming.length}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="border-b border-border bg-input-background px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">현재 Halt / Resume</h2>
        </div>

        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Halt 목록 불러오는 중…
          </div>
        ) : items.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            현재 표시할 Trade Halt가 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-border bg-card text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5 font-medium">종목</th>
                  <th className="px-3 py-2.5 font-medium">시장</th>
                  <th className="px-3 py-2.5 font-medium">사유</th>
                  <th className="px-3 py-2.5 font-medium">정지 시각</th>
                  <th className="px-3 py-2.5 font-medium">호가 재개</th>
                  <th className="px-3 py-2.5 font-medium">거래 재개</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={`${row.symbol}-${row.haltDate}-${row.haltTime}`} className="border-b border-border last:border-0">
                    <td className="px-3 py-3 align-top">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="font-mono">
                          {row.symbol}
                        </Badge>
                        {row.status === "resuming" ? (
                          <span className="text-[11px] font-medium text-green-600">재개 예정</span>
                        ) : (
                          <span className="text-[11px] font-medium text-red-500">Halt</span>
                        )}
                      </div>
                      <p className="mt-1 max-w-[220px] text-xs leading-snug text-muted-foreground">{row.name}</p>
                    </td>
                    <td className="px-3 py-3 align-top text-muted-foreground">{row.market || "—"}</td>
                    <td className="px-3 py-3 align-top">
                      <span className="font-mono text-xs">{row.reasonCode}</span>
                      <p className="mt-0.5 max-w-[200px] text-xs text-muted-foreground">{row.reasonLabel}</p>
                    </td>
                    <td className="px-3 py-3 align-top text-xs text-muted-foreground">
                      {formatEtHint(row.haltDate, row.haltTime)}
                    </td>
                    <td className="px-3 py-3 align-top text-xs font-medium text-foreground">
                      {formatEtHint(row.resumptionDate, row.resumptionQuoteTime)}
                    </td>
                    <td className="px-3 py-3 align-top text-xs font-medium text-foreground">
                      {formatEtHint(row.resumptionDate, row.resumptionTradeTime)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        출처: NASDAQ Trader Trade Halt RSS (무료). 시각은 동부시간(ET) 기준이며, T3 등에서
        호가 재개·거래 재개 시각이 따로 공지됩니다.
      </p>
    </div>
  );
}
