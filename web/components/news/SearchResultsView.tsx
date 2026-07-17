import { FileSearch, SearchX } from "lucide-react";
import { NewsCard } from "@/components/news/NewsCard";
import type { DisclosureWithStock } from "@/lib/types";

type SearchResultsViewProps = {
  q: string;
  items: DisclosureWithStock[];
  total: number;
};

export function SearchResultsView({ q, items, total }: SearchResultsViewProps) {
  if (!q) {
    return (
      <div
        className="flex flex-col items-center rounded-xl border border-border bg-card px-6 py-16 text-center"
        role="status"
      >
        <FileSearch className="mb-4 h-12 w-12 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium text-foreground">검색어를 입력해 주세요.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          상단 검색창에서 티커·종목명·종목코드를 검색할 수 있습니다.
        </p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        className="flex flex-col items-center rounded-xl border border-border bg-card px-6 py-16 text-center"
        role="status"
      >
        <SearchX className="mb-4 h-12 w-12 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium text-foreground">
          「{q}」에 대한 검색 결과가 없습니다.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          다른 티커나 종목명으로 다시 검색해 보세요.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2" role="list">
      {items.map((item) => (
        <div key={item.id} role="listitem">
          <NewsCard item={item} />
        </div>
      ))}
      {total >= 200 ? (
        <p className="col-span-full mt-2 text-center text-xs text-muted-foreground">
          검색 결과는 최대 200건까지 표시됩니다.
        </p>
      ) : null}
    </div>
  );
}
