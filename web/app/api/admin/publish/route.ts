import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { validateAdminPublishMarket } from "@/lib/admin-publish-market";
import { isAdminEmail } from "@/lib/admin-auth";
import { previewSummaryFromBody } from "@/lib/manual-post";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

async function upsertStockId(
  admin: ReturnType<typeof createAdminClient>,
  stockName: string,
  stockCode: string,
  marketType: "us" | "kr"
): Promise<string | null> {
  const { data, error } = await admin
    .from("stocks")
    .upsert(
      { name: stockName, ticker: stockCode, market: marketType },
      { onConflict: "ticker" }
    )
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[admin/publish] stock upsert", error.message);
    return null;
  }
  return data?.id ?? null;
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const image = formData.get("image");
  const marketCheck = validateAdminPublishMarket(
    String(formData.get("market_type") ?? ""),
    String(formData.get("stock_name") ?? ""),
    String(formData.get("stock_code") ?? "")
  );

  if (!title) {
    return NextResponse.json({ ok: false, error: "제목을 입력해 주세요." }, { status: 400 });
  }
  if (!body) {
    return NextResponse.json({ ok: false, error: "본문을 입력해 주세요." }, { status: 400 });
  }
  if (!marketCheck.ok) {
    return NextResponse.json({ ok: false, error: marketCheck.error }, { status: 400 });
  }

  const { marketType, stockName, stockCode } = marketCheck;
  let coverImageUrl: string | null = null;

  try {
    const admin = createAdminClient();

    if (image instanceof File && image.size > 0) {
      if (!ALLOWED_IMAGE_TYPES.has(image.type)) {
        return NextResponse.json(
          { ok: false, error: "이미지는 JPG, PNG, WebP, GIF만 업로드할 수 있습니다." },
          { status: 400 }
        );
      }
      if (image.size > MAX_IMAGE_BYTES) {
        return NextResponse.json(
          { ok: false, error: "이미지는 5MB 이하여야 합니다." },
          { status: 400 }
        );
      }

      const ext = image.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
      const buffer = Buffer.from(await image.arrayBuffer());

      const { error: uploadError } = await admin.storage
        .from("news-images")
        .upload(path, buffer, { contentType: image.type, upsert: false });

      if (uploadError) {
        console.error("[admin/publish] upload", uploadError.message);
        return NextResponse.json(
          { ok: false, error: "이미지 업로드에 실패했습니다. Supabase Storage 버킷 news-images를 확인하세요." },
          { status: 500 }
        );
      }

      const { data: publicUrl } = admin.storage.from("news-images").getPublicUrl(path);
      coverImageUrl = publicUrl.publicUrl;
    }

    const stockId = await upsertStockId(admin, stockName, stockCode, marketType);
    const summary = previewSummaryFromBody(body);
    const externalId = `admin:${crypto.randomUUID()}`;

    const { data, error } = await admin
      .from("disclosures")
      .insert({
        stock_id: stockId,
        external_id: externalId,
        title,
        raw_content: body,
        summary,
        sentiment: null,
        analysis_score: null,
        market_type: marketType,
        stock_name: stockName,
        stock_code: stockCode,
        gemini_metadata: {
          source: "admin_publish",
          cover_image: coverImageUrl,
          author_email: user.email,
          market_type: marketType,
          stock_name: stockName,
          stock_code: stockCode,
        },
      })
      .select("id, created_at, market_type")
      .maybeSingle();

    if (error) {
      console.error("[admin/publish] insert", error.message);
      return NextResponse.json({ ok: false, error: "발행에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      id: data?.id ?? null,
      createdAt: data?.created_at ?? null,
      marketType: data?.market_type ?? marketType,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "서버 오류";
    console.error("[admin/publish]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
