import { fetchTossPrices } from "@/lib/toss/market-data";
import { requireTossOr503, tossErrorResponse, tossOk } from "@/lib/toss/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const blocked = requireTossOr503();
  if (blocked) return blocked;
  const symbols = (new URL(req.url).searchParams.get("symbols") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 200);
  if (!symbols.length) {
    return tossErrorResponse(new Error("symbols 필요 예: ?symbols=AAPL,TSLA"), "toss/prices");
  }
  try {
    const items = await fetchTossPrices(symbols);
    return tossOk({ items, count: items.length });
  } catch (e) {
    return tossErrorResponse(e, "toss/prices");
  }
}
