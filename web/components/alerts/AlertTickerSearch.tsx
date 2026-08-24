"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type TickerHit = {
  ticker: string;
  name: string;
};

type AlertTickerSearchProps = {
  ticker: string | null;
  companyName: string | null;
  disabled?: boolean;
  onSelect: (hit: TickerHit) => void;
};

export function AlertTickerSearch({
  ticker,
  companyName,
  disabled,
  onSelect,
}: AlertTickerSearchProps) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(!ticker);
  const [hits, setHits] = useState<TickerHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!ticker) {
      setEditing(true);
      return;
    }
    setEditing(false);
    setQuery("");
  }, [ticker, companyName]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (!editing) return;
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
          setOpen(true);
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
  }, [query, editing]);

  function pick(hit: TickerHit) {
    onSelect(hit);
    setEditing(false);
    setQuery("");
    setHits([]);
    setOpen(false);
  }

  if (!editing && ticker) {
    return (
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xl font-semibold tracking-wide text-foreground">{ticker}</p>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{companyName || "회사명"}</p>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setEditing(true);
            setQuery(ticker);
            window.setTimeout(() => inputRef.current?.focus(), 0);
          }}
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
        >
          변경
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      {loading ? (
        <Loader2
          className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground"
          aria-hidden
        />
      ) : null}
      <input
        ref={inputRef}
        type="search"
        value={query}
        disabled={disabled}
        autoComplete="off"
        placeholder="티커 또는 회사명 검색"
        aria-label="티커 또는 회사명 검색"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (hits.length > 0) setOpen(true);
        }}
        className={cn(
          "h-11 w-full rounded-lg border border-border bg-input-background pl-10 pr-10 text-base text-foreground",
          "placeholder:text-muted-foreground outline-none",
          "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
          "disabled:opacity-50"
        )}
      />
      {open && hits.length > 0 ? (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-card py-1 shadow-md">
          {hits.map((hit) => (
            <li key={hit.ticker}>
              <button
                type="button"
                onClick={() => pick(hit)}
                className="flex w-full items-baseline gap-2 px-3 py-2 text-left hover:bg-accent"
              >
                <span className="font-mono text-sm font-semibold text-foreground">{hit.ticker}</span>
                <span className="truncate text-sm text-muted-foreground">{hit.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
