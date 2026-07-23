import { NextResponse } from "next/server";
import { runEdgarDisclosureCrawl } from "@/lib/crawl/edgar-disclosure-crawl";
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

  // Bootstrap: when CRON_SECRET is unset, accept Vercel Cron invocations only.
  return vercelCron;
}

export async function GET(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const result = await runEdgarDisclosureCrawl(admin);
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[cron/disclosure-crawl]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
