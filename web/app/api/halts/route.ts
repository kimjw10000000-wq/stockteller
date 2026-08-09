import { NextResponse } from "next/server";
import { getTradeHaltsCached } from "@/lib/halts/halts-cache";
import { getHaltProviderMeta } from "@/lib/halts/provider";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const force = new URL(req.url).searchParams.get("force") === "1";
  const meta = getHaltProviderMeta();

  try {
    const result = await getTradeHaltsCached({ force });
    return NextResponse.json(
      {
        ...result,
        provider: meta.id,
        providerLabel: meta.label,
        supportsSubSecond: meta.supportsSubSecond,
      },
      {
        headers: {
          // CDN/브라우저가 응답을 붙잡지 않게 — 중계 캐시는 서버 메모리가 담당
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (e) {
    console.error("[halts]", e);
    return NextResponse.json(
      {
        items: [],
        count: 0,
        source: "nasdaq-rss" as const,
        fetchedAt: new Date().toISOString(),
        servedFromCache: false,
        upstreamAgeMs: 0,
        upstreamRetryAfterMs: 0,
        upstreamPollIntervalMs: meta.minUpstreamIntervalMs,
        relay: "server-memory" as const,
        provider: meta.id,
        providerLabel: meta.label,
        supportsSubSecond: meta.supportsSubSecond,
        error: e instanceof Error ? e.message : "server error",
      },
      {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
