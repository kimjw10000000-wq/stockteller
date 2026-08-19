import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";

function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"));

  if (url.searchParams.get("error")) {
    return NextResponse.redirect(new URL("/login?error=auth", url.origin));
  }

  if (code) {
    const { supabase, applyCookies } = createSupabaseRouteHandlerClient(request);
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return applyCookies(NextResponse.redirect(new URL(next, url.origin)));
    }
  }

  return NextResponse.redirect(new URL("/login?error=auth", url.origin));
}
