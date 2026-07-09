import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { checkAdminEmail, getAdminEmails, logAdminAuthDebug } from "@/lib/admin-auth";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";

export async function GET(request: NextRequest) {
  const { supabase, applyCookies } = createSupabaseRouteHandlerClient(request);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    console.log("[admin/session] getUser error", authError.message);
  }

  if (!user) {
    console.log("[admin/session] no authenticated user", {
      cookieCount: request.cookies.getAll().length,
      adminEmailsConfigured: getAdminEmails().length,
    });
    return applyCookies(
      NextResponse.json(
        { ok: false, admin: false, reason: "no_user" },
        { status: 401 }
      )
    );
  }

  const check = checkAdminEmail(user.email);
  if (!check.ok) {
    logAdminAuthDebug("session denied", user.email, {
      reason: check.allowedConfigured ? "not_in_allowlist" : "admin_emails_empty",
    });
    return applyCookies(
      NextResponse.json(
        {
          ok: false,
          admin: false,
          reason: check.allowedConfigured ? "not_admin" : "admin_emails_not_configured",
        },
        { status: 401 }
      )
    );
  }

  return applyCookies(
    NextResponse.json({ ok: true, admin: true, email: user.email })
  );
}
