import { NextResponse } from "next/server";
import { applyParsedActual } from "@/lib/indicators/scraper";
import { getSnapshot } from "@/lib/indicators/store";
import type { IndicatorId } from "@/lib/indicators/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Test helper: simulate a BLS release push over SSE.
 * Disabled in production unless INDICATOR_ALLOW_MOCK=1.
 */
export async function POST(req: Request) {
  const allow =
    process.env.INDICATOR_ALLOW_MOCK === "1" || process.env.NODE_ENV !== "production";
  if (!allow) {
    return NextResponse.json({ ok: false, error: "Mock disabled" }, { status: 403 });
  }

  try {
    const body = (await req.json()) as {
      indicator?: IndicatorId;
      actual?: number;
      period?: "mom" | "yoy" | "unknown";
      message?: string;
    };
    const indicator = body.indicator === "PPI" ? "PPI" : "CPI";
    const actual = Number(body.actual);
    if (!Number.isFinite(actual)) {
      return NextResponse.json({ ok: false, error: "actual number required" }, { status: 400 });
    }

    await applyParsedActual(indicator, actual, {
      period: body.period ?? "mom",
      message: body.message ?? `mock ${indicator} actual=${actual}`,
    });

    return NextResponse.json({ ok: true, ...getSnapshot() });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
