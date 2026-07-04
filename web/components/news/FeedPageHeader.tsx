"use client";

import { Suspense } from "react";
import { NewsSortBar } from "@/components/news/NewsSortBar";

type FeedPageHeaderProps = {
  q: string;
};

export function FeedPageHeader({ q }: FeedPageHeaderProps) {
  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-foreground">최신 뉴스</h1>
        <Suspense fallback={<div className="h-8 w-48 animate-pulse rounded-md bg-muted" />}>
          <NewsSortBar />
        </Suspense>
      </div>
      {q ? (
        <p className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground">
          검색어 <span className="font-semibold">「{q}」</span>
        </p>
      ) : null}
    </>
  );
}
