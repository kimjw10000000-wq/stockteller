import { requireTossOr503, tossErrorResponse, tossOk } from "@/lib/toss/http";
import { fetchTossIndicatorPrices, TOSS_MARKET_INDICATOR_SYMBOLS } from "@/lib/toss/indicators";
import { omitRawList } from "@/lib/toss/omit-raw";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const blocked = requireTossOr503();
  if (blocked) return blocked;
  const symbolsParam = new URL(req.url).searchParams.get("symbols")?.trim();
  const symbols = (
    symbolsParam ? symbolsParam.split(",") : [...TOSS_MARKET_INDICATOR_SYMBOLS]
  )
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 200);
  try {
    const items = await fetchTossIndicatorPrices(symbols);
    return tossOk({
      items: omitRawList(items),
      catalog: TOSS_MARKET_INDICATOR_SYMBOLS,
      count: items.length,
    });
  } catch (e) {
    return tossErrorResponse(e, "toss/indicators/prices");
  }
}
