import { requireTossOr503, tossErrorResponse, tossOk } from "@/lib/toss/http";
import { omitRaw, omitRawList } from "@/lib/toss/omit-raw";
import { fetchTossRankings } from "@/lib/toss/rankings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const blocked = requireTossOr503();
  if (blocked) return blocked;
  const url = new URL(req.url);
  const type = url.searchParams.get("type")?.trim() || "TOP_GAINERS";
  const marketCountry = (url.searchParams.get("marketCountry")?.trim().toUpperCase() ||
    "US") as "KR" | "US";
  const duration = url.searchParams.get("duration")?.trim() || "1d";
  const count = Number(url.searchParams.get("count") ?? "30");
  if (marketCountry !== "KR" && marketCountry !== "US") {
    return tossErrorResponse(new Error("marketCountry must be KR or US"), "toss/rankings");
  }
  try {
    const page = await fetchTossRankings({
      type,
      marketCountry,
      duration,
      count: Number.isFinite(count) ? count : 30,
    });
    return tossOk({
      rankings: {
        ...omitRaw(page),
        rankings: omitRawList(page.rankings),
      },
    });
  } catch (e) {
    return tossErrorResponse(e, "toss/rankings");
  }
}
