import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin-auth";
import { matchesStockSearchQuery } from "@/lib/news-display";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DisclosureWithStock } from "@/lib/types";

export type AdminDisclosureListItem = Pick<
  DisclosureWithStock,
  | "id"
  | "title"
  | "created_at"
  | "market_type"
  | "stock_name"
  | "stock_code"
  | "membership_type"
  | "gemini_metadata"
> & {
  stocks: { name: string; ticker: string } | null;
};

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const q = new URL(req.url).searchParams.get("q")?.trim().toLowerCase() ?? "";
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("disclosures")
    .select("id, title, created_at, market_type, stock_name, stock_code, membership_type, gemini_metadata, stocks(name, ticker)")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[admin/disclosures]", error.message);
    return NextResponse.json({ ok: false, error: "목록을 불러오지 못했습니다." }, { status: 500 });
  }

  let items = (data ?? []).filter(
    (row) => row.gemini_metadata?.source === "admin_publish" || row.gemini_metadata?.source === "manual_editor"
  ) as unknown as AdminDisclosureListItem[];
  if (q) {
    items = items.filter((item) =>
      matchesStockSearchQuery(
        {
          ...item,
          stock_id: null,
          external_id: null,
          raw_content: "",
          summary: null,
          sentiment: null,
          analysis_score: null,
        } as DisclosureWithStock,
        q
      )
    );
  }

  return NextResponse.json({ ok: true, items });
}
