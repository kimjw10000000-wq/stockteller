import { requireTossOr503, tossErrorResponse, tossOk } from "@/lib/toss/http";
import { omitRaw } from "@/lib/toss/omit-raw";
import { fetchTossMarketCalendar } from "@/lib/toss/stocks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const blocked = requireTossOr503();
  if (blocked) return blocked;
  const url = new URL(req.url);
  const country = (url.searchParams.get("country")?.trim().toUpperCase() || "US") as "KR" | "US";
  const date = url.searchParams.get("date")?.trim() || undefined;
  if (country !== "KR" && country !== "US") {
    return tossErrorResponse(new Error("country must be KR or US"), "toss/market-calendar");
  }
  try {
    const calendar = await fetchTossMarketCalendar(country, date);
    return tossOk({ calendar: omitRaw(calendar) });
  } catch (e) {
    return tossErrorResponse(e, "toss/market-calendar");
  }
}
