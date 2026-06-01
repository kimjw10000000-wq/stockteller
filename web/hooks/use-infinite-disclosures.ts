"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DisclosureWithStock } from "@/lib/types";
import type { NewsMarketKey, NewsSortKey } from "@/lib/news-sort";

type FetchParams = {
  sort: NewsSortKey;
  market: NewsMarketKey;
  q?: string;
  excludeId?: string;
  cursor?: string;
};

async function fetchPage(params: FetchParams): Promise<{
  items: DisclosureWithStock[];
  nextCursor: string | null;
}> {
  const sp = new URLSearchParams();
  sp.set("sort", params.sort);
  sp.set("market", params.market);
  sp.set("limit", "20");
  if (params.q) sp.set("q", params.q);
  if (params.cursor) sp.set("cursor", params.cursor);
  if (params.excludeId) sp.set("excludeId", params.excludeId);

  const res = await fetch(`/api/disclosures?${sp.toString()}`);
  const j = (await res.json()) as {
    ok?: boolean;
    items?: DisclosureWithStock[];
    nextCursor?: string | null;
  };
  if (!res.ok || !j.ok) return { items: [], nextCursor: null };
  return { items: j.items ?? [], nextCursor: j.nextCursor ?? null };
}

export function useInfiniteDisclosures(
  initialItems: DisclosureWithStock[],
  initialCursor: string | null,
  params: Omit<FetchParams, "cursor">
) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(!initialCursor);
  const paramsKey = `${params.sort}|${params.market}|${params.q ?? ""}|${params.excludeId ?? ""}`;

  useEffect(() => {
    setItems(initialItems);
    setCursor(initialCursor);
    setDone(!initialCursor);
  }, [paramsKey, initialItems, initialCursor]);

  const loadMore = useCallback(async () => {
    if (loading || done || !cursor) return;
    setLoading(true);
    try {
      const { items: more, nextCursor } = await fetchPage({ ...params, cursor });
      setItems((prev) => {
        const ids = new Set(prev.map((i) => i.id));
        return [...prev, ...more.filter((m) => !ids.has(m.id))];
      });
      setCursor(nextCursor);
      setDone(!nextCursor || more.length === 0);
    } finally {
      setLoading(false);
    }
  }, [cursor, done, loading, params]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || done) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "200px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore, done]);

  return { items, loading, done, sentinelRef, loadMore };
}
