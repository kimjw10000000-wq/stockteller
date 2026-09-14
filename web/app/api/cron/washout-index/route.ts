import { NextResponse } from "next/server";
import { compactOldWashoutSamples } from "@/lib/us-market/washout-samples";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function authorize(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const auth = req.headers.get("authorization")?.trim() ?? "";
  const vercelCron = req.headers.get("x-vercel-cron") === "1";
  if (cronSecret) return auth === `Bearer ${cronSecret}`;
  return vercelCron;
}

/** Polygon을 치지 않는다. 오래된 샘플만 정리. */
export async function GET(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const compact = await compactOldWashoutSamples();
    return NextResponse.json({ ok: true, polygon: false, compact });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[cron/washout-index]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
