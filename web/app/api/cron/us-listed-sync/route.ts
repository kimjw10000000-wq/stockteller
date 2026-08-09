import { NextResponse } from "next/server";
import { syncUsListedCompanies } from "@/lib/companies/sync-us-listed";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function authorize(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const auth = req.headers.get("authorization")?.trim() ?? "";
  const vercelCron = req.headers.get("x-vercel-cron") === "1";

  if (cronSecret) {
    return auth === `Bearer ${cronSecret}`;
  }
  return vercelCron;
}

export async function GET(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const url = new URL(req.url);
    const batchRaw = Number(url.searchParams.get("marketCapBatch") ?? "300");
    const marketCapBatchSize = Number.isFinite(batchRaw) ? Math.min(Math.max(batchRaw, 0), 2000) : 300;
    const nwRaw = Number(url.searchParams.get("newswireBatch") ?? "8");
    const newswireBatchSize = Number.isFinite(nwRaw) ? Math.min(Math.max(nwRaw, 0), 40) : 8;
    const skipMarketCap = url.searchParams.get("skipMarketCap") === "1";
    const skipNewswire = url.searchParams.get("skipNewswire") === "1";

    const result = await syncUsListedCompanies(admin, {
      marketCapBatchSize,
      skipMarketCap,
      newswireBatchSize,
      skipNewswire,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[cron/us-listed-sync]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
