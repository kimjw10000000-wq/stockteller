"use client";

import type { DisclosureWithStock } from "@/lib/types";
import { disclosureStockLabel, disclosureMarket } from "@/lib/news-display";
import { formatNewsDate } from "@/lib/news-sort";
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
  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <header className="mb-4 space-y-1">
        <h2 className="text-lg font-semibold text-foreground">뉴스 관리 목록</h2>
        <p className="text-xs text-muted-foreground">
          티커 · 주식 이름 · 종목 코드로만 검색됩니다. (제목·본문은 검색되지 않음)
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

            return (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
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
                <Button
                  type="button"
                  variant={editingId === item.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => onEdit(item)}
                >
                  {editingId === item.id ? "수정 중" : "수정"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
