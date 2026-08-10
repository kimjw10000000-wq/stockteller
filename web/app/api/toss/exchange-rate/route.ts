import { requireTossOr503, tossErrorResponse, tossOk } from "@/lib/toss/http";
import { omitRaw } from "@/lib/toss/omit-raw";
import { fetchTossExchangeRate } from "@/lib/toss/market-info";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const blocked = requireTossOr503();
  if (blocked) return blocked;
  const url = new URL(req.url);
  try {
    const exchangeRate = await fetchTossExchangeRate({
      baseCurrency: url.searchParams.get("base")?.trim() || "USD",
      quoteCurrency: url.searchParams.get("quote")?.trim() || "KRW",
      dateTime: url.searchParams.get("dateTime")?.trim() || undefined,
    });
    return tossOk({ exchangeRate: omitRaw(exchangeRate) });
  } catch (e) {
    return tossErrorResponse(e, "toss/exchange-rate");
  }
}
