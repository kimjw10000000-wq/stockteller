import { NextResponse } from "next/server";
import { startIndicatorScrapeWindow } from "@/lib/indicators/scraper";
import type { IndicatorId } from "@/lib/indicators/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function authorize(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim() || process.env.INDICATOR_ADMIN_SECRET?.trim();
  const auth = req.headers.get("authorization")?.trim() ?? "";
  const vercelCron = req.headers.get("x-vercel-cron") === "1";
  if (secret) return auth === `Bearer ${secret}` || vercelCron;
  // Allow public wake near release from the indicators page (rate-limited by single-flight)
  return true;
}

export async function POST(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      indicator?: IndicatorId | "ALL";
      durationMs?: number;
    };
    const which = body.indicator ?? "ALL";
    const ids: IndicatorId[] =
      which === "CPI" || which === "PPI" ? [which] : ["CPI", "PPI"];

    const results = ids.map((id) => ({
      indicator: id,
      ...startIndicatorScrapeWindow(id, { durationMs: body.durationMs }),
    }));

    return NextResponse.json({ ok: true, results });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  return POST(req);
}
