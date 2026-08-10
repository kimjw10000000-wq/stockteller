import { requireTossOr503, tossErrorResponse, tossOk } from "@/lib/toss/http";
import { omitRawList } from "@/lib/toss/omit-raw";
import { fetchTossStocks } from "@/lib/toss/stocks";

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
    return tossErrorResponse(new Error("symbols required, e.g. ?symbols=AAPL,TSLA"), "toss/stocks");
  }
  try {
    const items = await fetchTossStocks(symbols);
    return tossOk({ items: omitRawList(items), count: items.length });
  } catch (e) {
    return tossErrorResponse(e, "toss/stocks");
  }
}
