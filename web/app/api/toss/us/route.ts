import { requireTossOr503, tossErrorResponse, tossOk } from "@/lib/toss/http";
import {
  fetchUsMarketBundle,
  fetchUsSymbolSnapshot,
  fetchUsSymbolUniverseCandidates,
} from "@/lib/toss/us-market";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** GET /api/toss/us?mode=bundle|snapshot|universe&symbols=AAPL,TSLA */
export async function GET(req: Request) {
  const blocked = requireTossOr503();
  if (blocked) return blocked;
  const url = new URL(req.url);
  const mode = (url.searchParams.get("mode")?.trim() || "bundle").toLowerCase();
  const symbols = (url.searchParams.get("symbols") ?? "AAPL,TSLA,NVDA,MSFT,AMZN")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  try {
    if (mode === "universe") {
      const universe = await fetchUsSymbolUniverseCandidates(100);
      return tossOk({ mode, ...universe });
    }
    if (mode === "snapshot") {
      const symbol = symbols[0];
      if (!symbol) return tossErrorResponse(new Error("symbols 필요"), "toss/us");
      const snapshot = await fetchUsSymbolSnapshot(symbol, {
        includeOrderbook: url.searchParams.get("orderbook") !== "0",
        includeTrades: url.searchParams.get("trades") !== "0",
      });
      return tossOk({ mode, snapshot });
    }

    const bundle = await fetchUsMarketBundle(symbols, {
      maxSymbols: Math.min(symbols.length, 10),
      includeOrderbook: url.searchParams.get("orderbook") === "1",
      includeTrades: url.searchParams.get("trades") === "1",
    });
    return tossOk({ mode: "bundle", bundle });
  } catch (e) {
    return tossErrorResponse(e, "toss/us");
  }
}
