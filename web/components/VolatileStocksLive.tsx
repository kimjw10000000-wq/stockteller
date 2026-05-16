"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import { UsMoverRow } from "@/components/UsMoverRow";
import { useUsMarketGainers, type UsGainersClientSource } from "@/hooks/use-us-market-gainers";
import type { UsDayGainerQuote } from "@/lib/us-market/us-day-gainer-types";
import type { VolatileRow } from "@/lib/volatile-row";

export type { VolatileRow } from "@/lib/volatile-row";
function getBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/rest\/v1\/?$/i, "").replace(/\/$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function RowItem({ r }: { r: VolatileRow }) {
  const pct = r.change_pct != null ? Number(r.change_pct) : null;
  const pctLabel = pct == null ? "—" : `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
  const pctClass =
    pct == null ? "text-slate-400" : pct >= 0 ? "font-semibold text-rose-600" : "font-medium text-blue-600";

  return (
    <li className="border-b border-inherit px-3 py-2.5 text-sm last:border-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-mono font-semibold text-slate-900">{r.ticker}</span>
        <span className="text-xs text-slate-500">{r.currency}</span>
        <span className={pctClass}>{pctLabel}</span>
      </div>
      {r.name ? (
        <p className="mt-1 line-clamp-2 text-left text-xs leading-snug text-slate-600">{r.name}</p>
      ) : null}
      <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
        {r.last_price != null ? <span>가격 {Number(r.last_price).toLocaleString()}</span> : null}
        {r.volume != null ? <span>거래량 {Number(r.volume).toLocaleString()}</span> : null}
        <span className="ml-auto text-slate-400">{r.source}</span>
      </div>
    </li>
  );
}

type MarketConfig = {
  key: "US" | "JP" | "KR";
  title: string;
  subtitle: string;
  sourceLabel: string;
  ring: string;
  headerBg: string;
  badge: string;
};

const US_VOLATILE_MIN_PCT = 20;
const US_POLL_MS = 45_000;

function usQuotesToVolatileRows(items: UsDayGainerQuote[], source: UsGainersClientSource): VolatileRow[] {
  const now = new Date().toISOString();
  const sourceLabel =
    source === "alphavantage"
      ? "Alpha Vantage"
      : source === "yahoo-browser"
        ? "Yahoo (브라우저)"
        : source === "yahoo-api"
          ? "Yahoo (서버)"
          : "—";
  return items.map((q) => ({
    id: `us-${q.symbol}`,
    market: "US",
    ticker: q.symbol,
    name: q.shortName || q.longName,
    currency: "USD",
    last_price: q.regularMarketPrice,
    prev_close: null,
    change_pct: q.regularMarketChangePercent,
    volume: q.regularMarketVolume,
    source: sourceLabel,
    updated_at: now,
  }));
}

const MARKETS: MarketConfig[] = [
  {
    key: "US",
    title: "미국 주식",
    subtitle: `당일 +${US_VOLATILE_MIN_PCT}% 이상 · 행의 호재/악재: SEC 최근 8-K → Gemini 요약`,
    sourceLabel: "Yahoo / AV",
    ring: "ring-1 ring-blue-200/80",
    headerBg: "bg-gradient-to-r from-[#3182f6]/10 to-blue-50/50",
    badge: "bg-[#3182f6] text-white",
  },
  {
    key: "JP",
    title: "일본 주식",
    subtitle: "J-Quants 일봉·폴링 기반",
    sourceLabel: "J-Quants",
    ring: "ring-1 ring-slate-300/80",
    headerBg: "bg-gradient-to-r from-slate-600/10 to-slate-50/80",
    badge: "bg-slate-700 text-white",
  },
  {
    key: "KR",
    title: "한국 주식",
    subtitle: "한국투자증권 KIS 실시간 체결",
    sourceLabel: "KIS",
    ring: "ring-1 ring-emerald-200/80",
    headerBg: "bg-gradient-to-r from-emerald-600/10 to-emerald-50/50",
    badge: "bg-emerald-600 text-white",
  },
];

export function VolatileStocksLive() {
  const [jpKrRows, setJpKrRows] = useState<VolatileRow[]>([]);
  const { items: usQuotes, loading: usLoading, err: usErr, source: usSource, delayedMarketSnapshot: usDelayed, finnhubQuoteRefined: usFinnhub } =
    useUsMarketGainers(US_VOLATILE_MIN_PCT, US_POLL_MS);
  const usRows = useMemo(() => usQuotesToVolatileRows(usQuotes, usSource), [usQuotes, usSource]);
  const [jpKrErr, setJpKrErr] = useState<string | null>(null);
  const [jpKrNote, setJpKrNote] = useState<string | null>(null);
  const [supabaseLive, setSupabaseLive] = useState(false);

  const byMarket = useMemo(() => {
    const m: Record<string, VolatileRow[]> = {
      US: [...usRows].sort(
        (a, b) => (Number(b.change_pct) || 0) - (Number(a.change_pct) || 0)
      ),
      JP: [],
      KR: [],
    };
    for (const r of jpKrRows) {
      const k = (r.market || "").toUpperCase();
      if (k === "JP" || k === "KR") {
        if (!m[k].some((x) => x.id === r.id)) m[k].push(r);
      }
    }
    for (const k of ["JP", "KR"] as const) {
      m[k] = m[k]!.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    }
    return m;
  }, [usRows, jpKrRows]);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setJpKrNote("일·한국 칸은 Supabase와 엔진(npm run engine)이 있을 때 갱신됩니다.");
      return;
    }

    let ch: RealtimeChannel | null = null;

    const load = async () => {
      const { data, error } = await supabase
        .from("high_volatility_stocks")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(120);
      if (error) {
        setJpKrErr(error.message);
        return;
      }
      const only = (data ?? []).filter((r) => {
        const k = ((r as VolatileRow).market || "").toUpperCase();
        return k === "JP" || k === "KR";
      }) as VolatileRow[];
      setJpKrRows(only);
      setJpKrErr(null);
    };

    void load();

    ch = supabase
      .channel("high_volatility_stocks_feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "high_volatility_stocks" },
        (payload) => {
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            const row = payload.new as VolatileRow;
            const k = (row.market || "").toUpperCase();
            if (k !== "JP" && k !== "KR") return;
            setJpKrRows((prev) => {
              const rest = prev.filter((r) => r.id !== row.id);
              return [row, ...rest].slice(0, 120);
            });
          } else if (payload.eventType === "DELETE" && payload.old && "id" in payload.old) {
            const id = String((payload.old as { id: string }).id);
            setJpKrRows((prev) => prev.filter((r) => r.id !== id));
          }
        }
      )
      .subscribe((status) => {
        setSupabaseLive(status === "SUBSCRIBED");
      });

    return () => {
      if (ch) supabase.removeChannel(ch);
    };
  }, []);

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        미국:{" "}
        {usLoading ? (
          "목록 불러오는 중…"
        ) : usErr ? (
          <span className="font-medium text-amber-700">{usErr}</span>
        ) : (
          <>
            <span className="font-medium text-emerald-600">약 {US_POLL_MS / 1000}초마다 갱신</span>
            {usDelayed ? (
              <span className="font-medium text-amber-800">
                {" "}
                · Alpha Vantage는 전일(또는 지연) 스냅샷일 수 있습니다. 당일 기준은 Yahoo·Finnhub 쪽을 보세요.
              </span>
            ) : null}
            {usFinnhub ? (
              <span className="text-slate-600">
                {" "}
                · 등락률은 Finnhub 시세로 맞춤(무료 플랜은 거래소별 지연·틱 실시간 아님).
              </span>
            ) : null}
          </>
        )}
        {jpKrNote ? (
          <>
            {" "}
            · {jpKrNote}
          </>
        ) : (
          <>
            {" "}
            · JP/KR Realtime:{" "}
            {supabaseLive ? (
              <span className="font-medium text-emerald-600">연결됨</span>
            ) : (
              "연결 중…"
            )}
          </>
        )}
      </p>
      {jpKrErr ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900" role="alert">
          일·한국 DB: {jpKrErr}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        {MARKETS.map((cfg) => {
          const list = byMarket[cfg.key] ?? [];
          const anchor = `market-${cfg.key.toLowerCase()}`;

          const emptyHint =
            cfg.key === "US" ? (
              usLoading ? (
                "Yahoo 데이터를 불러오는 중입니다."
              ) : usErr ? (
                "위 상태 메시지를 확인해 주세요."
              ) : (
                "스크리너 상위에 +20% 미만이거나, 전일 스냅샷만 나왔을 수 있습니다."
              )
            ) : (
              <>
                엔진 실행(npm run engine) · {cfg.sourceLabel}
              </>
            );

          return (
            <section
              key={cfg.key}
              id={anchor}
              className={`flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ${cfg.ring}`}
            >
              <header className={`px-4 py-3 ${cfg.headerBg}`}>
                <div className="flex items-center gap-2">
                  <span className={`rounded-lg px-2 py-0.5 text-xs font-bold ${cfg.badge}`}>{cfg.key}</span>
                  <h2 className="text-base font-bold text-slate-900">{cfg.title}</h2>
                </div>
                <p className="mt-1 text-xs text-slate-600">{cfg.subtitle}</p>
              </header>
              {list.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-slate-400">
                  감지된 종목 없음
                  <br />
                  <span className="text-xs">{emptyHint}</span>
                </div>
              ) : (
                <ul className="flex-1 divide-y divide-slate-100">
                  {list.map((r) =>
                    cfg.key === "US" ? (
                      <UsMoverRow key={r.id} r={r} />
                    ) : (
                      <RowItem key={r.id} r={r} />
                    )
                  )}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
