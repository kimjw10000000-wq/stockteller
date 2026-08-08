import { NextResponse } from "next/server";
import { isTossConfigured, TossApiError } from "@/lib/toss/client";
import { fetchTossPrices } from "@/lib/toss/market";

export const dynamic = "force-dynamic";

async function finnhubQuote(symbol: string) {
  const key = process.env.FINNHUB_API_KEY?.trim();
  if (!key) return null;
  const u = new URL("https://finnhub.io/api/v1/quote");
  u.searchParams.set("symbol", symbol);
  u.searchParams.set("token", key);
  const res = await fetch(u, { cache: "no-store" });
  if (!res.ok) return null;
  const j = (await res.json()) as { c?: number; d?: number; dp?: number; pc?: number };
  if (typeof j.c !== "number" || j.c <= 0) return null;
  return {
    symbol,
    price: j.c,
    change: typeof j.d === "number" ? j.d : null,
    changePct: typeof j.dp === "number" ? j.dp : null,
    volume: null as number | null,
    currency: "USD",
  };
}

export async function GET(req: Request) {
  const symbolsParam = new URL(req.url).searchParams.get("symbols")?.trim() || "";
  const symbols = symbolsParam
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 20);

  if (!symbols.length) {
    return NextResponse.json({ error: "symbols 쿼리가 필요합니다. 예: ?symbols=AAPL,005930" }, { status: 400 });
  }

  try {
    if (isTossConfigured()) {
      const prices = await fetchTossPrices(symbols);
      return NextResponse.json({
        items: prices.map((p) => ({
          symbol: p.symbol,
          price: p.price,
          change: p.change,
          changePct: p.changePct,
          volume: p.volume,
          currency: p.currency,
        })),
        source: "toss",
        configured: true,
        fetchedAt: new Date().toISOString(),
      });
    }

    const items = [];
    for (const s of symbols) {
      const q = await finnhubQuote(s);
      if (q) items.push(q);
    }

    return NextResponse.json({
      items,
      source: items.length ? "finnhub" : "none",
      configured: false,
      tossConfigured: false,
      message:
        items.length === 0
          ? "토스(TOSSINVEST_CLIENT_ID/SECRET) 또는 FINNHUB_API_KEY가 필요합니다."
          : "토스 미설정 — Finnhub 폴백",
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    const status = e instanceof TossApiError ? e.httpStatus : 500;
    console.error("[market/quote]", e);
    return NextResponse.json(
      {
        items: [],
        source: "error",
        error: e instanceof Error ? e.message : "server error",
        code: e instanceof TossApiError ? e.code : undefined,
        fetchedAt: new Date().toISOString(),
      },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}
