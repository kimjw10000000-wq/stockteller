import { requireTossOr503, tossErrorResponse, tossOk } from "@/lib/toss/http";
import { fetchTossIndicatorCandles } from "@/lib/toss/indicators";
import { omitRaw } from "@/lib/toss/omit-raw";
import type { TossCandleInterval } from "@/lib/toss/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const blocked = requireTossOr503();
  if (blocked) return blocked;
  const url = new URL(req.url);
  const symbol = url.searchParams.get("symbol")?.trim() ?? "";
  const interval = (url.searchParams.get("interval")?.trim() || "1d") as TossCandleInterval;
  const count = Number(url.searchParams.get("count") ?? "60");
  if (!symbol) return tossErrorResponse(new Error("symbol required"), "toss/indicators/candles");
  try {
    const page = await fetchTossIndicatorCandles(symbol, interval === "1m" ? "1m" : "1d", {
      count: Number.isFinite(count) ? count : 60,
      before: url.searchParams.get("before")?.trim() || undefined,
    });
    return tossOk({ page: omitRaw(page) });
  } catch (e) {
    return tossErrorResponse(e, "toss/indicators/candles");
  }
}
