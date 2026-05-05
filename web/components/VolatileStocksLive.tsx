"use client";

import { useEffect, useState } from "react";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";

export type VolatileRow = {
  id: string;
  market: string;
  ticker: string;
  name: string | null;
  currency: string;
  last_price: number | null;
  prev_close: number | null;
  change_pct: number | null;
  volume: number | null;
  source: string | null;
  updated_at: string;
};

function getBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/rest\/v1\/?$/i, "").replace(/\/$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export function VolatileStocksLive() {
  const [rows, setRows] = useState<VolatileRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setErr("NEXT_PUBLIC_SUPABASE_URL / ANON 키가 없습니다.");
      return;
    }

    let ch: RealtimeChannel | null = null;

    const load = async () => {
      const { data, error } = await supabase
        .from("high_volatility_stocks")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) {
        setErr(error.message);
        return;
      }
      setRows((data ?? []) as VolatileRow[]);
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
            setRows((prev) => {
              const rest = prev.filter((r) => r.id !== row.id);
              return [row, ...rest].slice(0, 100);
            });
          } else if (payload.eventType === "DELETE" && payload.old && "id" in payload.old) {
            const id = String((payload.old as { id: string }).id);
            setRows((prev) => prev.filter((r) => r.id !== id));
          }
        }
      )
      .subscribe((status) => {
        setLive(status === "SUBSCRIBED");
      });

    return () => {
      if (ch) supabase.removeChannel(ch);
    };
  }, []);

  if (err) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="alert">
        {err}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Realtime: {live ? <span className="font-medium text-emerald-600">연결됨</span> : "연결 중…"}
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">아직 감지된 종목이 없습니다. 엔진(`npm run engine`)을 실행 중인지 확인하세요.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-white shadow-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
              <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs">{r.market}</span>
              <span className="font-mono font-medium">{r.ticker}</span>
              <span className="text-slate-500">{r.currency}</span>
              {r.last_price != null ? <span>현재 {Number(r.last_price).toLocaleString()}</span> : null}
              {r.change_pct != null ? (
                <span className="font-medium text-rose-600">+{Number(r.change_pct).toFixed(2)}%</span>
              ) : null}
              {r.volume != null ? <span className="text-slate-400">Vol {Number(r.volume).toLocaleString()}</span> : null}
              <span className="ml-auto text-xs text-slate-400">{r.source}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
