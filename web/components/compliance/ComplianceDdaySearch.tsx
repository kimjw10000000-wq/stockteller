"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Nasdaq5550Checklist } from "@/components/compliance/Nasdaq5550Checklist";
import { lookupNasdaq5550, type Nasdaq5550Record } from "@/lib/nasdaq-5550-mock";

export function ComplianceDdaySearch() {
  const [query, setQuery] = useState("");
  const [record, setRecord] = useState<Nasdaq5550Record | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  function onSearch(e?: React.FormEvent) {
    e?.preventDefault();
    const ticker = query.trim().toUpperCase();
    setSearched(true);

    if (!ticker) {
      setRecord(null);
      setError("티커를 입력하세요.");
      return;
    }

    const found = lookupNasdaq5550(ticker);
    if (!found) {
      setRecord(null);
      setError("현재 등록되지 않거나 조회할 수 없는 티커입니다.");
      return;
    }

    setError(null);
    setRecord(found);
  }

  return (
    <div className="-mx-4 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-xl sm:mx-0">
      <div className="border-b border-slate-700 px-4 py-6 sm:px-8">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
          Delisting Risk · D-Day
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">
          상장폐지 위험 D-Day 검색
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
          티커를 검색해 나스닥 Rule 5550(a)·(b) 상장 유지 기준 충족 여부를 확인합니다.
          현재 Mock 데이터: <span className="font-mono text-slate-300">FFAI</span>
        </p>

        <form
          onSubmit={onSearch}
          className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-stretch"
        >
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">티커 검색</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value.toUpperCase())}
              placeholder="티커 입력 (예: FFAI)"
              autoCapitalize="characters"
              spellCheck={false}
              className="h-11 w-full rounded-lg border border-slate-600 bg-slate-800/80 pl-10 pr-3 font-mono text-sm text-white outline-none placeholder:text-slate-500 focus:border-slate-400 focus:ring-2 focus:ring-slate-500/40"
              aria-label="티커 검색"
            />
          </label>
          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-white px-5 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-200"
          >
            검색
          </button>
        </form>

        {error ? (
          <p
            className="mt-4 rounded-lg border border-rose-500/50 bg-rose-500/10 px-3 py-2.5 text-sm font-medium text-rose-300"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </div>

      {record ? (
        <div className="px-4 py-6 sm:px-8 sm:py-8">
          <p className="mb-4 text-sm font-semibold text-slate-200">
            나스닥 5550 상장 유지 기준 체크리스트
          </p>
          <Nasdaq5550Checklist record={record} />
        </div>
      ) : searched && !error ? null : !searched ? (
        <div className="px-4 py-10 text-center sm:px-8">
          <p className="text-sm text-slate-500">
            티커를 검색하면 Rule 5550 체크리스트가 여기에 표시됩니다.
          </p>
        </div>
      ) : null}
    </div>
  );
}
