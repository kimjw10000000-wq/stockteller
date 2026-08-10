import { fetchTossPriceLimits } from "@/lib/toss/market-data";
import { requireTossOr503, tossErrorResponse, tossOk } from "@/lib/toss/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const blocked = requireTossOr503();
  if (blocked) return blocked;
  const symbol = new URL(req.url).searchParams.get("symbol")?.trim() ?? "";
  if (!symbol) return tossErrorResponse(new Error("symbol 필요"), "toss/price-limits");
  try {
    const priceLimits = await fetchTossPriceLimits(symbol);
    return tossOk({ priceLimits });
  } catch (e) {
    return tossErrorResponse(e, "toss/price-limits");
  }
}
