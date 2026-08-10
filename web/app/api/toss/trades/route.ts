import { fetchTossTrades } from "@/lib/toss/market-data";
import { requireTossOr503, tossErrorResponse, tossOk } from "@/lib/toss/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const blocked = requireTossOr503();
  if (blocked) return blocked;
  const url = new URL(req.url);
  const symbol = url.searchParams.get("symbol")?.trim() ?? "";
  const count = Number(url.searchParams.get("count") ?? "20");
  if (!symbol) return tossErrorResponse(new Error("symbol 필요"), "toss/trades");
  try {
    const trades = await fetchTossTrades(symbol, Number.isFinite(count) ? count : 20);
    return tossOk({ symbol, trades, count: trades.length });
  } catch (e) {
    return tossErrorResponse(e, "toss/trades");
  }
}
