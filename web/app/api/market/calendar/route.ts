import { NextResponse } from "next/server";
import { isTossConfigured, TossApiError } from "@/lib/toss/client";
import { fetchTossMarketCalendar } from "@/lib/toss/stocks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const country = (url.searchParams.get("country")?.trim().toUpperCase() || "US") as
    | "KR"
    | "US";
  const date = url.searchParams.get("date")?.trim() || undefined;

  if (country !== "KR" && country !== "US") {
    return NextResponse.json({ ok: false, error: "country는 KR 또는 US" }, { status: 400 });
  }

  if (!isTossConfigured()) {
    return NextResponse.json(
      { ok: false, error: "TOSSINVEST_CLIENT_ID / TOSSINVEST_CLIENT_SECRET 미설정" },
      { status: 503 }
    );
  }

  try {
    const calendar = await fetchTossMarketCalendar(country, date);
    return NextResponse.json({ ok: true, source: "toss", country, calendar });
  } catch (e) {
    const err = e as TossApiError;
    return NextResponse.json(
      { ok: false, error: err.message || String(e), code: err.code },
      { status: err.httpStatus || 500 }
    );
  }
}
