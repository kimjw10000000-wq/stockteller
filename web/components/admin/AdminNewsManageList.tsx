"use client";

import { useEffect, useState } from "react";
import type { DisclosureWithStock } from "@/lib/types";
import { disclosureStockLabel, disclosureMarket } from "@/lib/news-display";
import { formatNewsDate } from "@/lib/news-sort";
import {
  resolveDisclosureSignalStatus,
  SIGNAL_LABELS,
  SIGNAL_STATUSES,
  type SignalStatus,
} from "@/lib/signal-status";
import { resolveDisclosureStockCode } from "@/lib/stock-signal-sync";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AdminNewsManageListProps = {
  items: DisclosureWithStock[];
  loading: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSearchSubmit: (e: React.FormEvent) => void;
  onEdit: (item: DisclosureWithStock) => void;
  editingId: string | null;
};

export function AdminNewsManageList({
  items,
  loading,
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  onEdit,
  editingId,
}: AdminNewsManageListProps) {
  const [signalDrafts, setSignalDrafts] = useState<Record<string, SignalStatus>>({});
  const [savedSignals, setSavedSignals] = useState<Record<string, SignalStatus>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [signalMessage, setSignalMessage] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    const next: Record<string, SignalStatus> = {};
    for (const item of items) {
      next[item.id] = resolveDisclosureSignalStatus(item);
    }
    setSignalDrafts(next);
    setSavedSignals(next);
  }, [items]);

  function getDraftSignal(item: DisclosureWithStock): SignalStatus {
    return signalDrafts[item.id] ?? resolveDisclosureSignalStatus(item);
  }

  function isSignalDirty(item: DisclosureWithStock): boolean {
    const draft = getDraftSignal(item);
    const saved = savedSignals[item.id] ?? resolveDisclosureSignalStatus(item);
    return draft !== saved;
  }

  async function onSaveSignal(item: DisclosureWithStock) {
    const signal_status = getDraftSignal(item);
    setSavingId(item.id);
    setSignalMessage(null);
    try {
      const res = await fetch(`/api/admin/publish/${item.id}/signal`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signal_status }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        detail?: string;
        signal_status?: SignalStatus;
        stockCode?: string;
        updatedCount?: number;
      };
      if (!res.ok || !j.ok) {
        const detail = j.detail ? ` — ${j.detail}` : "";
        console.error(
          "[admin/signal save] 구체적 에러 원인:",
          j.error ?? res.statusText,
          detail,
          { status: res.status, id: item.id, signal_status, response: j }
        );
        setSignalMessage({
          ok: false,
          text: `${j.error ?? "시그널 저장에 실패했습니다."}${detail}`,
        });
        return;
      }
      const next = j.signal_status ?? signal_status;
      const stockCode = j.stockCode ?? resolveDisclosureStockCode(item);

      const applyToSameStock = (prev: Record<string, SignalStatus>) => {
        const updated = { ...prev };
        for (const row of items) {
          if (stockCode && resolveDisclosureStockCode(row) === stockCode) {
            updated[row.id] = next;
          } else if (row.id === item.id) {
            updated[row.id] = next;
          }
        }
        return updated;
      };

      setSavedSignals(applyToSameStock);
      setSignalDrafts(applyToSameStock);

      const count = j.updatedCount ?? 1;
      setSignalMessage({
        ok: true,
        text: count > 1 ? `동일 종목 ${count}건 일괄 저장되었습니다.` : "성공적으로 저장되었습니다.",
      });
    } catch (err) {
      console.error("[admin/signal save] network — 구체적 에러 원인:", err, {
        id: item.id,
        signal_status,
      });
      setSignalMessage({ ok: false, text: "네트워크 오류입니다." });
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <header className="mb-4 space-y-1">
        <h2 className="text-lg font-semibold text-foreground">뉴스 관리 목록</h2>
        <p className="text-xs text-muted-foreground">
          티커 · 주식 이름 · 종목 코드로만 검색됩니다. 시그널은 목록에서 바로 변경 후 [저장]하세요.
        </p>
      </header>

      <form onSubmit={onSearchSubmit} className="mb-4 flex gap-2">
        <Input
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="티커 / 종목명 / 종목코드 검색"
          aria-label="관리자 뉴스 종목 검색"
        />
        <Button type="submit" variant="outline" size="sm">
          검색
        </Button>
      </form>

      {signalMessage ? (
        <p
          className={`mb-3 text-sm ${signalMessage.ok ? "text-green-600" : "text-destructive"}`}
          role="status"
        >
          {signalMessage.text}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">불러오는 중…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">발행된 뉴스가 없습니다.</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => {
            const { stock, name } = disclosureStockLabel(item);
            const marketLabel =
              disclosureMarket(item) === "kr"
                ? "한국"
                : disclosureMarket(item) === "us"
                  ? "미국"
                  : "—";
            const stockLabel = [name, stock].filter((v) => v && v !== "—").join(" · ") || "—";
            const draftSignal = getDraftSignal(item);

            return (
              <li key={item.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="truncate font-medium text-foreground">{item.title ?? "제목 없음"}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatNewsDate(item.created_at)}</span>
                    <span>·</span>
                    <span>{marketLabel}</span>
                    <span>·</span>
                    <span className="font-mono">{stockLabel}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor={`signal-${item.id}`}>
                    시그널 등급
                  </label>
                  <select
                    id={`signal-${item.id}`}
                    value={draftSignal}
                    onChange={(e) =>
                      setSignalDrafts((prev) => ({
                        ...prev,
                        [item.id]: e.target.value as SignalStatus,
                      }))
                    }
                    className="h-9 rounded-md border border-border bg-input-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                  >
                    {SIGNAL_STATUSES.map((key) => (
                      <option key={key} value={key}>
                        {SIGNAL_LABELS[key]}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={savingId === item.id || !isSignalDirty(item)}
                    onClick={() => void onSaveSignal(item)}
                  >
                    {savingId === item.id ? "저장 중…" : "저장"}
                  </Button>
                  <Button
                    type="button"
                    variant={editingId === item.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => onEdit(item)}
                  >
                    {editingId === item.id ? "수정 중" : "수정"}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
