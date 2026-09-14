import { NextResponse } from "next/server";
import { compactOldWashoutSamples } from "@/lib/us-market/washout-samples";
import { getWashoutBoard } from "@/lib/us-market/washout-live";
import { isUsWeekday, sessionAtInstant } from "@/lib/us-market/us-session";

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

export async function GET(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const now = new Date();
  if (!isUsWeekday(now) || sessionAtInstant(now) == null) {
    return NextResponse.json({ ok: true, skipped: true });
  }
  try {
    const result = await getWashoutBoard({ force: true, range: "1d" });
    let compact = { compacted: 0, pruned: 0 };
    if (now.getUTCMinutes() === 0) {
      compact = await compactOldWashoutSamples(now.getTime());
    }
    return NextResponse.json({
      ok: true,
      index: result.index,
      items: result.items.length,
      sessionDate: result.sessionDate,
      compact,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[cron/washout-index]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
