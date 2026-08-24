import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  canSendFreeAlertThisWindow,
  getLatestPremarketResetUtc,
  getNextPremarketResetUtc,
} from "@/lib/alerts/eastern-premarket";
import { ALERT_SLOT_COUNT, FREE_ALERT_SLOT_LIMIT, UPGRADE_ALERT_MESSAGE } from "@/lib/alerts/plan";
import {
  ensureFreeAlertSlot,
  getUserBillingPlan,
  listAlertRows,
  mapAlertRow,
  normalizeTicker,
} from "@/lib/alerts/server";
import { getUsListedCompany } from "@/lib/companies/search";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UPGRADE_MESSAGE = UPGRADE_ALERT_MESSAGE;

export async function GET(request: NextRequest) {
  const { supabase, applyCookies } = createSupabaseRouteHandlerClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return applyCookies(NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }));
  }

  try {
    const now = new Date();
    const plan = await getUserBillingPlan(supabase, user.id);
    const isPro = plan === "pro";
    let rows = await listAlertRows(supabase, user.id);
    if (!isPro) {
      rows = await ensureFreeAlertSlot(supabase, user.id, rows);
      rows = rows.slice(0, FREE_ALERT_SLOT_LIMIT);
    } else {
      rows = rows.slice(0, ALERT_SLOT_COUNT);
    }

    const alerts = rows.map((row) => mapAlertRow(row, isPro, now));
    const lastAny = rows.reduce<string | null>((acc, row) => {
      if (!row.last_triggered_at) return acc;
      if (!acc || row.last_triggered_at > acc) return row.last_triggered_at;
      return acc;
    }, null);

    return applyCookies(
      NextResponse.json({
        ok: true,
        plan,
        isPro,
        slotLimit: isPro ? ALERT_SLOT_COUNT : FREE_ALERT_SLOT_LIMIT,
        alerts,
        nextResetAt: getNextPremarketResetUtc(now).toISOString(),
        windowStartAt: getLatestPremarketResetUtc(now).toISOString(),
        canSendToday: isPro || canSendFreeAlertThisWindow(lastAny, now),
      })
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const missing =
      message.includes("does not exist") ||
      message.includes("42P01") ||
      message.includes("42703");
    console.error("[alerts GET]", message);
    return applyCookies(
      NextResponse.json(
        { ok: false, error: missing ? "alerts_table_missing" : message },
        { status: missing ? 503 : 500 }
      )
    );
  }
}

export async function POST(request: NextRequest) {
  const { supabase, applyCookies } = createSupabaseRouteHandlerClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return applyCookies(NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }));
  }

  try {
    const plan = await getUserBillingPlan(supabase, user.id);
    if (plan !== "pro") {
      return applyCookies(
        NextResponse.json(
          { ok: false, error: "upgrade_required", message: UPGRADE_MESSAGE },
          { status: 403 }
        )
      );
    }

    const existing = await listAlertRows(supabase, user.id);
    if (existing.length >= ALERT_SLOT_COUNT) {
      return applyCookies(
        NextResponse.json(
          { ok: false, error: "slot_limit", message: `슬롯은 최대 ${ALERT_SLOT_COUNT}개입니다.` },
          { status: 403 }
        )
      );
    }

    let ticker: string | null = null;
    let companyName: string | null = null;
    try {
      const body = (await request.json()) as { ticker?: string; companyName?: string };
      if (body.ticker?.trim()) {
        ticker = normalizeTicker(body.ticker);
        const admin = createAdminClient();
        const company = await getUsListedCompany(admin, ticker);
        if (!company) {
          return applyCookies(
            NextResponse.json({ ok: false, error: "unknown_ticker" }, { status: 400 })
          );
        }
        companyName = body.companyName?.trim() || company.name;
      }
    } catch {
      /* empty slot */
    }

    const { data, error } = await supabase
      .from("dilution_alerts")
      .insert({
        user_id: user.id,
        ticker,
        company_name: companyName,
        enabled: false,
      })
      .select(
        "id,user_id,ticker,company_name,enabled,last_triggered_at,created_at,updated_at"
      )
      .single();

    if (error) {
      if (error.message.includes("duplicate") || error.code === "23505") {
        return applyCookies(
          NextResponse.json({ ok: false, error: "duplicate_ticker" }, { status: 409 })
        );
      }
      throw new Error(error.message);
    }

    return applyCookies(
      NextResponse.json({
        ok: true,
        alert: mapAlertRow(data, true),
      })
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("only 1 alert slot")) {
      return applyCookies(
        NextResponse.json(
          { ok: false, error: "upgrade_required", message: UPGRADE_MESSAGE },
          { status: 403 }
        )
      );
    }
    console.error("[alerts POST]", message);
    return applyCookies(NextResponse.json({ ok: false, error: message }, { status: 500 }));
  }
}
