import { NextResponse } from "next/server";
import { publishWashoutCatalog } from "@/lib/us-market/washout-published";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function authorize(req: Request): boolean {
  const vercelCron = req.headers.get("x-vercel-cron") === "1";
  if (vercelCron) return true;
  const cronSecret = process.env.CRON_SECRET?.trim();
  const auth = req.headers.get("authorization")?.trim() ?? "";
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  console.error("[cron/washout-catalog] unauthorized", {
    cronHeader: vercelCron,
    hasAuthorization: auth.length > 0,
  });
  return false;
}

/** 매분 설거지 점수표를 그려 둔다. 방문자는 이 표를 읽기만 한다. Polygon은 호출하지 않는다. */
export async function GET(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const published = await publishWashoutCatalog();
    return NextResponse.json({
      ok: true,
      polygon: false,
      builtAt: published.builtAt,
      keys: Object.keys(published.boards).length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[cron/washout-catalog]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
