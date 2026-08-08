import { NextResponse } from "next/server";
import { isTossConfigured, TossApiError } from "@/lib/toss/client";
import { fetchTossCandles } from "@/lib/toss/market";

export const dynamic = "force-dynamic";

async function finnhubCandles(symbol: string, days: number) {
  const key = process.env.FINNHUB_API_KEY?.trim();
  if (!key) return null;
  const to = Math.floor(Date.now() / 1000);
  const from = to - days * 86_400;
  const u = new URL("https://finnhub.io/api/v1/stock/candle");
  u.searchParams.set("symbol", symbol);
  u.searchParams.set("resolution", "D");
  u.searchParams.set("from", String(from));
  u.searchParams.set("to", String(to));
  u.searchParams.set("token", key);
  const res = await fetch(u, { cache: "no-store" });
  if (!res.ok) return null;
  const j = (await res.json()) as {
    s?: string;
    t?: number[];
    o?: number[];
    h?: number[];
    l?: number[];
    c?: number[];
    v?: number[];
  };
  if (j.s !== "ok" || !j.t?.length) return null;
  return j.t.map((t, i) => ({
    time: new Date(t * 1000).toISOString().slice(0, 10),
    open: j.o![i],
    high: j.h![i],
    low: j.l![i],
    close: j.c![i],
    volume: j.v?.[i] ?? null,
  }));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const symbol = url.searchParams.get("symbol")?.trim().toUpperCase() || "";
  const interval = url.searchParams.get("interval") === "1m" ? "1m" : "1d";
  const countRaw = Number(url.searchParams.get("count") ?? "60");
  const count = Number.isFinite(countRaw) ? Math.min(Math.max(countRaw, 1), 200) : 60;

  if (!symbol) {
    return NextResponse.json({ error: "symbol 쿼리가 필요합니다. 예: ?symbol=AAPL" }, { status: 400 });
  }

  try {
    if (isTossConfigured()) {
      const candles = await fetchTossCandles(symbol, interval, count);
      return NextResponse.json({
        symbol,
        interval,
        candles,
        source: "toss",
        fetchedAt: new Date().toISOString(),
      });
    }

    const candles = await finnhubCandles(symbol, count);
    return NextResponse.json({
      symbol,
      interval: "1d",
      candles: candles ?? [],
      source: candles ? "finnhub" : "none",
      message: candles
        ? "토스 미설정 — Finnhub 일봉 폴백"
        : "토스(TOSSINVEST_CLIENT_ID/SECRET) 또는 FINNHUB_API_KEY가 필요합니다.",
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    const status = e instanceof TossApiError ? e.httpStatus : 500;
    console.error("[market/candles]", e);
    return NextResponse.json(
      {
        symbol,
        candles: [],
        source: "error",
        error: e instanceof Error ? e.message : "server error",
        code: e instanceof TossApiError ? e.code : undefined,
        fetchedAt: new Date().toISOString(),
      },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}
