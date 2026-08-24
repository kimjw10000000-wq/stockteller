"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";

export type TickerHit = {
  ticker: string;
  name: string;
};

type TickerSearchModalProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (hit: TickerHit) => void;
  initialQuery?: string;
};

export function TickerSearchModal({
  open,
  onClose,
  onSelect,
  initialQuery = "",
}: TickerSearchModalProps) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(initialQuery);
  const [hits, setHits] = useState<TickerHit[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery(initialQuery);
    setHits([]);
    window.setTimeout(() => inputRef.current?.focus(), 0);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, initialQuery]);

  useEffect(() => {
    if (!open) return;
    if (timer.current != null) window.clearTimeout(timer.current);
    const q = query.trim();
    if (q.length < 1) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/compliance/companies?q=${encodeURIComponent(q)}&limit=8`,
            { cache: "no-store" }
          );
          const j = (await res.json()) as { items?: TickerHit[] };
          setHits(j.items ?? []);
        } catch {
          setHits([]);
        } finally {
          setLoading(false);
        }
      })();
    }, 200);
    return () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    };
  }, [query, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-sky-950/30"
        aria-label="닫기"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl border-2 border-sky-400 bg-white p-5 shadow-lg"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-base font-semibold text-slate-900">
            종목 검색
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-sky-50 hover:text-slate-700"
            aria-label="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-500"
            aria-hidden
          />
          {loading ? (
            <Loader2
              className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-sky-500"
              aria-hidden
            />
          ) : null}
          <input
            ref={inputRef}
            type="search"
            value={query}
            autoComplete="off"
            placeholder="티커 또는 회사명"
            aria-label="티커 또는 회사명 검색"
            onChange={(e) => setQuery(e.target.value)}
            className="h-11 w-full rounded-xl border-2 border-sky-400 bg-sky-50 pl-10 pr-10 text-base text-slate-900 outline-none placeholder:text-slate-400 focus-visible:border-sky-600 focus-visible:ring-2 focus-visible:ring-sky-300"
          />
        </div>
        <ul className="mt-3 min-h-[8rem] overflow-auto">
          {hits.map((hit) => (
            <li key={hit.ticker}>
              <button
                type="button"
                onClick={() => {
                  onSelect(hit);
                  onClose();
                }}
                className="flex w-full items-baseline gap-2 rounded-lg px-3 py-2.5 text-left hover:bg-sky-50"
              >
                <span className="font-mono text-sm font-semibold text-sky-700">{hit.ticker}</span>
                <span className="truncate text-sm text-slate-500">{hit.name}</span>
              </button>
            </li>
          ))}
          {!loading && query.trim() && hits.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-slate-400">검색 결과가 없습니다.</li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
