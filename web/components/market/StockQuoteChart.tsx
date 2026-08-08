"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Search, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

type QuoteItem = {
  symbol: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
  volume: number | null;
  currency: string | null;
};

type Candle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

function CandleChart({ candles }: { candles: Candle[] }) {
  const w = 640;
  const h = 220;
  const pad = 16;

  const { path, min, max } = useMemo(() => {
    if (!candles.length) return { path: "", min: 0, max: 0 };
    const lows = candles.map((c) => c.low);
    const highs = candles.map((c) => c.high);
    const minV = Math.min(...lows);
    const maxV = Math.max(...highs);
    const span = maxV - minV || 1;
    const step = (w - pad * 2) / Math.max(candles.length - 1, 1);
    const pts = candles.map((c, i) => {
      const x = pad + i * step;
      const y = pad + ((maxV - c.close) / span) * (h - pad * 2);
      return `${x},${y}`;
    });
    return { path: `M ${pts.join(" L ")}`, min: minV, max: maxV };
  }, [candles]);

  if (!candles.length) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-lg border border-border bg-input-background text-sm text-muted-foreground">
        차트 데이터 없음
      </div>
    );
  }

  const last = candles[candles.length - 1]!;
  const first = candles[0]!;
  const up = last.close >= first.close;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" role="img" aria-label="가격 차트">
        <rect width={w} height={h} fill="transparent" />
        <path
          d={path}
          fill="none"
          stroke={up ? "#22c55e" : "#ef4444"}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <div className="flex justify-between border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
        <span>{candles[0]?.time}</span>
        <span>
          {min.toLocaleString(undefined, { maximumFractionDigits: 2 })} –{" "}
          {max.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </span>
        <span>{candles[candles.length - 1]?.time}</span>
      </div>
    </div>
  );
}

export function StockQuoteChart({ defaultSymbol = "AAPL" }: { defaultSymbol?: string }) {
  const [query, setQuery] = useState(defaultSymbol);
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [quote, setQuote] = useState<QuoteItem | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [source, setSource] = useState<string>("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (sym: string) => {
    const s = sym.trim().toUpperCase();
    if (!s) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    setSymbol(s);
    try {
      const [qRes, cRes] = await Promise.all([
        fetch(`/api/market/quote?symbols=${encodeURIComponent(s)}`, { cache: "no-store" }),
        fetch(`/api/market/candles?symbol=${encodeURIComponent(s)}&interval=1d&count=60`, {
          cache: "no-store",
        }),
      ]);
      const qj = (await qRes.json()) as {
        items?: QuoteItem[];
        source?: string;
        message?: string;
        error?: string;
      };
      const cj = (await cRes.json()) as {
        candles?: Candle[];
        source?: string;
        message?: string;
        error?: string;
      };

      if (!qRes.ok && qj.error) setError(qj.error);
      else setError(null);

      setQuote(qj.items?.[0] ?? null);
      setCandles(cj.candles ?? []);
      setSource([qj.source, cj.source].filter(Boolean).join(" / "));
      setMessage(qj.message || cj.message || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 실패");
      setQuote(null);
      setCandles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(defaultSymbol);
  }, [defaultSymbol, load]);

  const pct = quote?.changePct;
  const up = pct != null && pct >= 0;

  return (
    <div className="mt-8 space-y-4">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void load(query);
        }}
      >
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="티커 (예: AAPL, 005930)"
            className="pl-10"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          조회
        </button>
      </form>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}
      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="font-mono">
                {symbol}
              </Badge>
              {source ? <span className="text-xs text-muted-foreground">source: {source}</span> : null}
            </div>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
              {quote?.price != null
                ? quote.price.toLocaleString(undefined, { maximumFractionDigits: 4 })
                : "—"}
              {quote?.currency ? (
                <span className="ml-2 text-sm font-normal text-muted-foreground">{quote.currency}</span>
              ) : null}
            </p>
          </div>
          {pct != null ? (
            <div
              className={`inline-flex items-center gap-1 text-sm font-medium ${
                up ? "text-green-500" : "text-red-500"
              }`}
            >
              {up ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              {up ? "+" : ""}
              {pct.toFixed(2)}%
            </div>
          ) : null}
        </div>
      </div>

      <CandleChart candles={candles} />
    </div>
  );
}
