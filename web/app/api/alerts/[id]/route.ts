import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getUsListedCompany } from "@/lib/companies/search";
import { getUserBillingPlan, mapAlertRow, normalizeTicker, type DilutionAlertRow } from "@/lib/alerts/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: { id: string } };

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { supabase, applyCookies } = createSupabaseRouteHandlerClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return applyCookies(NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }));
  }

  const id = params.id?.trim();
  if (!id) {
    return applyCookies(NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 }));
  }

  try {
    const plan = await getUserBillingPlan(supabase, user.id);
    const isPro = plan === "pro";
    const body = (await request.json()) as {
      ticker?: string | null;
      companyName?: string | null;
      enabled?: boolean;
    };

    const patch: Record<string, unknown> = {};

    if ("ticker" in body) {
      const raw = body.ticker?.trim() ?? "";
      if (!raw) {
        patch.ticker = null;
        patch.company_name = null;
        patch.enabled = false;
      } else {
        const ticker = normalizeTicker(raw);
        const admin = createAdminClient();
        const company = await getUsListedCompany(admin, ticker);
        if (!company) {
          return applyCookies(
            NextResponse.json({ ok: false, error: "unknown_ticker" }, { status: 400 })
          );
        }
        patch.ticker = ticker;
        patch.company_name = body.companyName?.trim() || company.name;
      }
    } else if (typeof body.companyName === "string") {
      patch.company_name = body.companyName.trim() || null;
    }

    if (typeof body.enabled === "boolean") {
      patch.enabled = body.enabled;
    }

    if (Object.keys(patch).length === 0) {
      return applyCookies(NextResponse.json({ ok: false, error: "empty_patch" }, { status: 400 }));
    }

    const { data: existing, error: loadError } = await supabase
      .from("dilution_alerts")
      .select(
        "id,user_id,ticker,company_name,enabled,last_triggered_at,created_at,updated_at"
      )
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (loadError) throw new Error(loadError.message);
    if (!existing) {
      return applyCookies(NextResponse.json({ ok: false, error: "not_found" }, { status: 404 }));
    }

    const current = existing as DilutionAlertRow;
    const nextTicker = ("ticker" in patch ? (patch.ticker as string | null) : current.ticker) ?? null;
    const nextEnabled = typeof patch.enabled === "boolean" ? patch.enabled : current.enabled;
    if (nextEnabled && !nextTicker) {
      return applyCookies(
        NextResponse.json({ ok: false, error: "ticker_required" }, { status: 400 })
      );
    }

    const { data, error } = await supabase
      .from("dilution_alerts")
      .update(patch)
      .eq("id", id)
      .eq("user_id", user.id)
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

    return applyCookies(NextResponse.json({ ok: true, alert: mapAlertRow(data, isPro) }));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[alerts PATCH]", message);
    return applyCookies(NextResponse.json({ ok: false, error: message }, { status: 500 }));
  }
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  const { supabase, applyCookies } = createSupabaseRouteHandlerClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return applyCookies(NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }));
  }

  const id = params.id?.trim();
  if (!id) {
    return applyCookies(NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 }));
  }

  try {
    const plan = await getUserBillingPlan(supabase, user.id);
    if (plan !== "pro") {
      return applyCookies(
        NextResponse.json(
          {
            ok: false,
            error: "cannot_delete_slot",
            message: "무료 플랜에서는 알람 슬롯을 삭제할 수 없습니다.",
          },
          { status: 403 }
        )
      );
    }

    const { error } = await supabase
      .from("dilution_alerts")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      if (error.message.includes("cannot delete")) {
        return applyCookies(
          NextResponse.json({ ok: false, error: "cannot_delete_slot" }, { status: 403 })
        );
      }
      throw new Error(error.message);
    }

    return applyCookies(NextResponse.json({ ok: true }));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[alerts DELETE]", message);
    return applyCookies(NextResponse.json({ ok: false, error: message }, { status: 500 }));
  }
}
