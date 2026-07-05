import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ ok: false, admin: false }, { status: 401 });
  }

  return NextResponse.json({ ok: true, admin: true, email: user.email });
}
