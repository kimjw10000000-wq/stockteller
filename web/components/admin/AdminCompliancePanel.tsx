"use client";

import { useMemo, useState } from "react";
import { Pencil, Save, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  COMPLIANCE_GRACE_OPTIONS,
  COMPLIANCE_SAMPLE_ITEMS,
  addDaysIso,
  daysUntil,
  graceLabel,
  type ComplianceGraceStatus,
  type ComplianceWatchItem,
} from "@/lib/compliance-admin";
import { cn } from "@/lib/utils";

const EMPTY_FORM = {
  ticker: "",
  stockName: "",
  noticeDate: "",
  ddayDate: "",
  status: "grace_180" as ComplianceGraceStatus,
};

export function AdminCompliancePanel() {
  const [items, setItems] = useState<ComplianceWatchItem[]>(COMPLIANCE_SAMPLE_ITEMS);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [stockQuery, setStockQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [listFilter, setListFilter] = useState("");

  const filteredItems = useMemo(() => {
    const q = listFilter.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        it.ticker.toLowerCase().includes(q) ||
        it.stockName.toLowerCase().includes(q)
    );
  }, [items, listFilter]);

  function setField<K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // Notice Date 변경 시 D-Day 기본값(180일) 자동 제안 — 수동 수정도 가능
      if (key === "noticeDate" && typeof value === "string" && value) {
        const suggested = addDaysIso(value, 180);
        if (suggested && (!prev.ddayDate || prev.ddayDate === addDaysIso(prev.noticeDate, 180))) {
          next.ddayDate = suggested;
        }
      }
      return next;
    });
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setStockQuery("");
    setEditingId(null);
    setMessage(null);
  }

  function applyStockSelection() {
    const raw = stockQuery.trim();
    if (!raw) {
      setMessage("종목 티커 또는 종목명을 입력하세요.");
      return;
    }
    // UI 단계: 검색어를 티커/종목명으로 분리해 폼에 반영 (연동은 다음 단계)
    const parts = raw.split(/[·|,/\s]+/).filter(Boolean);
    const maybeTicker = (parts[0] ?? raw).toUpperCase();
    const maybeName = parts.length > 1 ? parts.slice(1).join(" ") : raw;
    setForm((prev) => ({
      ...prev,
      ticker: maybeTicker,
      stockName: maybeName === maybeTicker ? prev.stockName || maybeName : maybeName,
    }));
    setMessage(`선택 반영: ${maybeTicker}`);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ticker = form.ticker.trim().toUpperCase();
    const stockName = form.stockName.trim() || ticker;
    if (!ticker) {
      setMessage("티커를 입력하거나 종목을 검색·선택하세요.");
      return;
    }
    if (!form.noticeDate || !form.ddayDate) {
      setMessage("경고 통지일(Notice Date)과 상장유지 D-Day를 입력하세요.");
      return;
    }

    const now = new Date().toISOString();
    if (editingId) {
      setItems((prev) =>
        prev.map((it) =>
          it.id === editingId
            ? {
                ...it,
                ticker,
                stockName,
                noticeDate: form.noticeDate,
                ddayDate: form.ddayDate,
                status: form.status,
                updatedAt: now,
              }
            : it
        )
      );
      setMessage(`${ticker} 업데이트됨 (로컬 미리보기 — DB 연동 예정)`);
    } else {
      const row: ComplianceWatchItem = {
        id: `local-${ticker.toLowerCase()}-${Date.now()}`,
        ticker,
        stockName,
        noticeDate: form.noticeDate,
        ddayDate: form.ddayDate,
        status: form.status,
        updatedAt: now,
      };
      setItems((prev) => [row, ...prev.filter((it) => it.ticker !== ticker)]);
      setMessage(`${ticker} 저장됨 (로컬 미리보기 — DB 연동 예정)`);
    }
    resetForm();
  }

  function onEditRow(item: ComplianceWatchItem) {
    setEditingId(item.id);
    setStockQuery(`${item.ticker} ${item.stockName}`);
    setForm({
      ticker: item.ticker,
      stockName: item.stockName,
      noticeDate: item.noticeDate,
      ddayDate: item.ddayDate,
      status: item.status,
    });
    setMessage(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {editingId ? "종목 유예 정보 수정" : "종목 유예 정보 등록"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Notice Date 기준 180일 D-Day를 자동 제안하며, 필요 시 수동으로 수정할 수 있습니다.
            </p>
          </div>
          {editingId ? (
            <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
              신규 등록으로
            </Button>
          ) : null}
        </div>

        <form onSubmit={onSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-foreground">종목 검색 / 선택</span>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  value={stockQuery}
                  onChange={(e) => setStockQuery(e.target.value)}
                  placeholder="티커 또는 종목명 (예: SDOT · Sadot)"
                  className="pl-10"
                  aria-label="종목 검색"
                />
              </div>
            </label>
            <div className="flex items-end">
              <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={applyStockSelection}>
                선택 반영
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-foreground">티커</span>
              <Input
                value={form.ticker}
                onChange={(e) => setField("ticker", e.target.value.toUpperCase())}
                placeholder="SDOT"
                autoCapitalize="characters"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-foreground">종목명</span>
              <Input
                value={form.stockName}
                onChange={(e) => setField("stockName", e.target.value)}
                placeholder="Sadot Group"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-foreground">경고 통지 수령일 (Notice Date)</span>
              <Input
                type="date"
                value={form.noticeDate}
                onChange={(e) => setField("noticeDate", e.target.value)}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-foreground">상장유지 D-Day</span>
              <Input
                type="date"
                value={form.ddayDate}
                onChange={(e) => setField("ddayDate", e.target.value)}
              />
              <span className="text-xs text-muted-foreground">
                기본: Notice Date + 180일 (수동 수정 가능)
              </span>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-foreground">유예 상태</span>
              <select
                value={form.status}
                onChange={(e) => setField("status", e.target.value as ComplianceGraceStatus)}
                className="flex h-9 w-full rounded-md border border-border bg-input-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              >
                {COMPLIANCE_GRACE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" className="min-w-[8rem]">
              <Save className="h-4 w-4" aria-hidden />
              {editingId ? "업데이트" : "저장"}
            </Button>
            {message ? (
              <p className="text-sm text-muted-foreground" role="status">
                {message}
              </p>
            ) : null}
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground">등록 종목 D-Day 현황</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              관리 중인 스몰캡 상장유지 유예 목록 ({filteredItems.length}건)
            </p>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={listFilter}
              onChange={(e) => setListFilter(e.target.value)}
              placeholder="목록 필터 (티커·종목명)"
              className="pl-10"
              aria-label="목록 필터"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="bg-input-background/80 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium sm:px-6">종목</th>
                <th className="px-3 py-3 font-medium">Notice</th>
                <th className="px-3 py-3 font-medium">D-Day</th>
                <th className="px-3 py-3 font-medium">남은 일</th>
                <th className="px-3 py-3 font-medium">유예 상태</th>
                <th className="px-4 py-3 font-medium sm:px-6"> </th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground sm:px-6">
                    등록된 종목이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const remain = daysUntil(item.ddayDate);
                  const urgent = remain !== null && remain <= 30;
                  const expired = remain !== null && remain < 0;
                  return (
                    <tr
                      key={item.id}
                      className={cn(
                        "border-t border-border",
                        editingId === item.id && "bg-accent/40"
                      )}
                    >
                      <td className="px-4 py-3 sm:px-6">
                        <span className="font-mono text-xs font-semibold text-foreground">
                          {item.ticker}
                        </span>
                        <span className="mt-0.5 block text-muted-foreground">{item.stockName}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-foreground">
                        {item.noticeDate}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-foreground">{item.ddayDate}</td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            "inline-flex rounded-md px-2 py-0.5 text-xs font-semibold",
                            expired
                              ? "bg-red-50 text-red-700"
                              : urgent
                                ? "bg-amber-50 text-amber-800"
                                : "bg-emerald-50 text-emerald-800"
                          )}
                        >
                          {remain === null
                            ? "—"
                            : expired
                              ? `${Math.abs(remain)}일 지남`
                              : `D-${remain}`}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-foreground">{graceLabel(item.status)}</td>
                      <td className="px-4 py-3 text-right sm:px-6">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => onEditRow(item)}
                          aria-label={`${item.ticker} 수정`}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                          수정
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
