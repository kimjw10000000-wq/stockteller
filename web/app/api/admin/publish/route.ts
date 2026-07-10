import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin-auth";
import {
  insertAdminDisclosure,
  parsePublishFormData,
  resolveCoverImageUrl,
  uploadCoverImage,
} from "@/lib/admin-publish-service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const maxDuration = 60;

function imageErrorMessage(code: string): string {
  switch (code) {
    case "IMAGE_TYPE":
      return "이미지는 JPG, PNG, WebP, GIF만 업로드할 수 있습니다.";
    case "IMAGE_SIZE":
      return "이미지는 5MB 이하여야 합니다.";
    case "IMAGE_UPLOAD":
      return "이미지 업로드에 실패했습니다. Supabase Storage 버킷 news-images를 확인하세요.";
    default:
      return "발행에 실패했습니다.";
  }
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

  const parsed = parsePublishFormData(formData);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  try {
    let coverImageUrl = resolveCoverImageUrl(parsed.data, null);
    if (parsed.data.image) {
      coverImageUrl = await uploadCoverImage(parsed.data.image);
    }

    const data = await insertAdminDisclosure(
      {
        title: parsed.data.title,
        body: parsed.data.body,
        marketType: parsed.data.marketType,
        stockName: parsed.data.stockName,
        stockCode: parsed.data.stockCode,
        coverImageUrl,
      },
      user.email ?? ""
    );

    return NextResponse.json({ ok: true, id: data.id, createdAt: data.created_at });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "서버 오류";
    if (msg.startsWith("IMAGE_")) {
      return NextResponse.json({ ok: false, error: imageErrorMessage(msg) }, { status: 400 });
    }
    console.error("[admin/publish]", msg);
    return NextResponse.json({ ok: false, error: "발행에 실패했습니다." }, { status: 500 });
  }
}
