"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import type { TradeHaltItem } from "@/lib/halts/nasdaq-trade-halts";

type HaltsResponse = {
  items: TradeHaltItem[];
  fetchedAt?: string;
  count?: number;
  error?: string;
};

function formatEtHint(date: string | null, time: string | null): string {
  if (!date && !time) return "미정";
  if (date && time) return `${date} ${time}`;
  return `${date || ""} ${time || ""}`.trim();
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
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] leading-snug text-neutral-600">
          NASDAQ RSS · 약 1분 갱신
          {fetchedAt ? (
            <span className="ml-1.5 text-neutral-500">
              · {new Date(fetchedAt).toLocaleString("ko-KR")}
            </span>
          ) : null}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded border border-neutral-300 bg-white px-2 py-1 text-[11px] font-medium text-neutral-900 transition-colors hover:border-neutral-500 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          새로고침
        </button>
      </div>

      {error ? (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded border border-neutral-300 bg-neutral-100 px-2.5 py-1.5">
          <p className="text-[10px] font-medium leading-tight text-neutral-600">현재 Halt</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums leading-none text-neutral-950">
            {halted.length}
          </p>
        </div>
        <div className="rounded border border-neutral-300 bg-neutral-100 px-2.5 py-1.5">
          <p className="text-[10px] font-medium leading-tight text-neutral-600">재개 일정 공지</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums leading-none text-neutral-950">
            {resuming.length}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded border border-neutral-300">
        <div className="border-b border-neutral-300 bg-neutral-100 px-3 py-2">
          <h2 className="text-xs font-bold text-neutral-950">현재 Halt / Resume</h2>
        </div>

        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-3 py-10 text-xs text-neutral-600">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Halt 목록 불러오는 중…
          </div>
        ) : items.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-neutral-600">
            현재 표시할 Trade Halt가 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-[12px] text-neutral-950">
              <thead>
                <tr className="border-b border-neutral-300 bg-white text-[10px] font-semibold uppercase tracking-wide text-neutral-700">
                  <th className="w-[28%] px-2.5 py-2">종목</th>
                  <th className="w-[10%] px-2 py-2">시장</th>
                  <th className="w-[18%] px-2 py-2">사유</th>
                  <th className="w-[15%] px-2 py-2">정지</th>
                  <th className="w-[14.5%] px-2 py-2">호가 재개</th>
                  <th className="w-[14.5%] px-2 py-2">거래 재개</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row, idx) => (
                  <tr
                    key={`${row.symbol}-${row.haltDate}-${row.haltTime}`}
                    className={`border-b border-neutral-200 last:border-0 ${
                      idx % 2 === 0 ? "bg-[#e8f1fb]" : "bg-white"
                    }`}
                  >
                    <td className="px-2.5 py-2 align-top">
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-mono text-[15px] font-bold leading-none tracking-tight text-neutral-950">
                          {row.symbol}
                        </span>
                        {row.status === "resuming" ? (
                          <span className="text-[9px] font-semibold uppercase leading-none text-green-700">
                            Resume
                          </span>
                        ) : (
                          <span className="text-[9px] font-semibold uppercase leading-none text-red-600">
                            Halt
                          </span>
                        )}
                      </div>
                      <p className="mt-1 max-w-[200px] text-[10px] leading-snug text-neutral-600">
                        {row.name}
                      </p>
                    </td>
                    <td className="px-2 py-2 align-top font-medium text-neutral-900">
                      {row.market || "—"}
                    </td>
                    <td className="px-2 py-2 align-top">
                      <span className="font-mono text-[13px] font-bold tracking-wide text-neutral-950">
                        {row.reasonCode}
                      </span>
                      <p className="mt-0.5 max-w-[140px] text-[10px] leading-snug text-neutral-700">
                        {row.reasonLabel}
                      </p>
                    </td>
                    <td className="px-2 py-2 align-top font-medium tabular-nums text-neutral-900">
                      <span className="block text-[11px]">{row.haltDate || "—"}</span>
                      <span className="block text-[10px] text-neutral-700">{row.haltTime || ""}</span>
                    </td>
                    <td className="px-2 py-2 align-top font-semibold tabular-nums text-neutral-950">
                      {formatEtHint(row.resumptionDate, row.resumptionQuoteTime)}
                    </td>
                    <td className="px-2 py-2 align-top font-semibold tabular-nums text-neutral-950">
                      {formatEtHint(row.resumptionDate, row.resumptionTradeTime)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[10px] leading-relaxed text-neutral-500">
        출처: NASDAQ Trader Trade Halt RSS. 시각은 동부시간(ET) 기준.
      </p>
    </div>
  );
}
