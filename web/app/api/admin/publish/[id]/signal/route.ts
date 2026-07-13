import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin-auth";
import {
  getAdminDisclosureById,
  updateAdminDisclosureSignal,
  type SignalSavePayload,
} from "@/lib/admin-publish-service";
import { isManualEditorPost } from "@/lib/manual-post";
import { isSignalStatus } from "@/lib/signal-status";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteContext = { params: { id: string } };

type SignalPatchBody = {
  signal_status?: unknown;
  market?: unknown;
  stock_name?: unknown;
  stock_code?: unknown;
  ticker?: unknown;
};

function parseStockOverride(body: SignalPatchBody): Omit<SignalSavePayload, "signal_status"> | undefined {
  const market = body.market === "us" || body.market === "kr" ? body.market : undefined;
  const stock_name = typeof body.stock_name === "string" ? body.stock_name.trim() : undefined;
  const stock_code = typeof body.stock_code === "string" ? body.stock_code.trim() : undefined;
  const ticker = typeof body.ticker === "string" ? body.ticker.trim() : undefined;

  if (!market && !stock_name && !stock_code && !ticker) return undefined;
  return { market, stock_name, stock_code, ticker };
}

export async function PATCH(req: Request, { params }: RouteContext) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const existing = await getAdminDisclosureById(params.id);
  if (!existing || !isManualEditorPost(existing)) {
    return NextResponse.json({ ok: false, error: "시그널을 변경할 수 있는 기사를 찾을 수 없습니다." }, { status: 404 });
  }

  let body: SignalPatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }

  if (!isSignalStatus(body.signal_status)) {
    return NextResponse.json(
      { ok: false, error: "signal_status는 positive, neutral, caution, danger 중 하나여야 합니다." },
      { status: 400 }
    );
  }

  const stockOverride = parseStockOverride(body);

  try {
    const data = await updateAdminDisclosureSignal(params.id, body.signal_status, stockOverride);
    return NextResponse.json({
      ok: true,
      id: data.id,
      signal_status: data.signal_status,
      stockCode: data.stockCode,
      stockName: data.stockName,
      ticker: data.ticker,
      updatedCount: data.updatedCount,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[admin/publish/signal] PATCH failed:", msg, {
      id: params.id,
      signal_status: body.signal_status,
      stockOverride,
    });

    if (msg === "ARTICLE_NOT_FOUND") {
      return NextResponse.json({ ok: false, error: "기사를 찾을 수 없습니다." }, { status: 404 });
    }
    if (msg === "INVALID_SIGNAL") {
      return NextResponse.json(
        { ok: false, error: "signal_status는 positive, neutral, caution, danger 중 하나여야 합니다." },
        { status: 400 }
      );
    }
    if (msg.startsWith("SIGNAL_SAVE_FAILED")) {
      return NextResponse.json(
        {
          ok: false,
          error: "시그널 저장에 실패했습니다. 종목 정보를 확인해 주세요.",
          detail: msg,
        },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { ok: false, error: "시그널 저장에 실패했습니다.", detail: msg },
      { status: 500 }
    );
  }
}
