import { NextResponse } from "next/server";
import { runEdgar6kCrawl } from "@/lib/crawl/edgar-6k-crawl";
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
    const eight = await runEdgar6kCrawl(admin, { form: "8-k" });
    const six = await runEdgar6kCrawl(admin, { form: "6-k" });
    const ok = eight.ok && six.ok;
    return NextResponse.json(
      { ok, inserted: eight.inserted + six.inserted, "8-k": eight, "6-k": six },
      { status: ok ? 200 : 500 }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[cron/edgar-6k]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
