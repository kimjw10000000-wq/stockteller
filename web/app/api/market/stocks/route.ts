import { NextResponse } from "next/server";
import { isTossConfigured, TossApiError } from "@/lib/toss/client";
import { fetchTossStocks } from "@/lib/toss/stocks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const symbolsParam = new URL(req.url).searchParams.get("symbols")?.trim() ?? "";
  const symbols = symbolsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 200);

  if (!symbols.length) {
    return NextResponse.json(
      { ok: false, error: "symbols 쿼리가 필요합니다. 예: ?symbols=AAPL,005930" },
      { status: 400 }
    );
  }

  if (!isTossConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: "TOSSINVEST_CLIENT_ID / TOSSINVEST_CLIENT_SECRET 미설정",
      },
      { status: 503 }
    );
  }

  try {
    const items = await fetchTossStocks(symbols);
    return NextResponse.json({
      ok: true,
      source: "toss",
      count: items.length,
      items: items.map((s) => ({
        symbol: s.symbol,
        name: s.name,
        englishName: s.englishName,
        market: s.market,
        currency: s.currency,
        status: s.status,
        isinCode: s.isinCode,
        listDate: s.listDate,
        delistDate: s.delistDate,
        sharesOutstanding: s.sharesOutstanding,
        koreanMarketDetail: s.koreanMarketDetail,
      })),
    });
  } catch (e) {
    const err = e as TossApiError;
    return NextResponse.json(
      {
        ok: false,
        error: err.message || String(e),
        code: err.code,
        status: err.httpStatus,
      },
      { status: err.httpStatus || 500 }
    );
  }
}
