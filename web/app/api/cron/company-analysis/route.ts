import { NextResponse } from "next/server";
import { analyzeCompanyBatch } from "@/lib/companies/analyze-company";
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
    const limitRaw = Number(url.searchParams.get("limit") ?? "5");
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 20) : 5;

    const result = await analyzeCompanyBatch(admin, limit);
    return NextResponse.json({
      ok: true,
      attempted: result.attempted,
      succeeded: result.ok,
      errors: result.errors,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[cron/company-analysis]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
