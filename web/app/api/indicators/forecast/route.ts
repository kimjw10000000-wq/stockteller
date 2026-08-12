import { NextResponse } from "next/server";
import { broadcastIndicator } from "@/lib/indicators/hub";
import { getSnapshot, setForecasts } from "@/lib/indicators/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorize(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim() || process.env.INDICATOR_ADMIN_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  const auth = req.headers.get("authorization")?.trim() ?? "";
  return auth === `Bearer ${secret}`;
}

export async function GET() {
  const snap = getSnapshot();
  return NextResponse.json({
    ok: true,
    forecasts: {
      CPI: snap.items.find((i) => i.indicator === "CPI")?.forecast ?? null,
      PPI: snap.items.find((i) => i.indicator === "PPI")?.forecast ?? null,
    },
    nextReleaseAt: {
      CPI: snap.items.find((i) => i.indicator === "CPI")?.nextReleaseAt ?? null,
      PPI: snap.items.find((i) => i.indicator === "PPI")?.nextReleaseAt ?? null,
    },
  });
}

export async function POST(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      cpi?: number | null;
      ppi?: number | null;
      cpiNextReleaseAt?: string | null;
      ppiNextReleaseAt?: string | null;
    };

    setForecasts({
      cpi: body.cpi,
      ppi: body.ppi,
      cpiNextReleaseAt: body.cpiNextReleaseAt,
      ppiNextReleaseAt: body.ppiNextReleaseAt,
    });
    const snap = getSnapshot();
    broadcastIndicator("snapshot", snap);
    return NextResponse.json({ ok: true, ...snap });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 400 }
    );
  }
}
