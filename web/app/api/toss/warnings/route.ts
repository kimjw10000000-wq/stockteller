import { requireTossOr503, tossErrorResponse, tossOk } from "@/lib/toss/http";
import { omitRawList } from "@/lib/toss/omit-raw";
import { fetchTossStockWarnings } from "@/lib/toss/stocks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const blocked = requireTossOr503();
  if (blocked) return blocked;
  const symbol = new URL(req.url).searchParams.get("symbol")?.trim() ?? "";
  if (!symbol) return tossErrorResponse(new Error("symbol required"), "toss/warnings");
  try {
    const warnings = await fetchTossStockWarnings(symbol);
    return tossOk({ symbol, warnings: omitRawList(warnings), count: warnings.length });
  } catch (e) {
    return tossErrorResponse(e, "toss/warnings");
  }
}
