import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin-auth";
import {
  getAdminDisclosureById,
  parsePublishFormData,
  resolveCoverImageUrl,
  updateAdminDisclosure,
  uploadCoverImage,
} from "@/lib/admin-publish-service";
import { isManualEditorPost } from "@/lib/manual-post";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const maxDuration = 60;

type RouteContext = { params: { id: string } };

function imageErrorMessage(code: string): string {
  switch (code) {
    case "IMAGE_TYPE":
      return "이미지는 JPG, PNG, WebP, GIF만 업로드할 수 있습니다.";
    case "IMAGE_SIZE":
      return "이미지는 5MB 이하여야 합니다.";
    case "IMAGE_UPLOAD":
      return "이미지 업로드에 실패했습니다.";
    default:
      return "수정에 실패했습니다.";
  }
}

export async function PUT(req: Request, { params }: RouteContext) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const existing = await getAdminDisclosureById(params.id);
  if (!existing || !isManualEditorPost(existing)) {
    return NextResponse.json({ ok: false, error: "수정할 수 있는 기사를 찾을 수 없습니다." }, { status: 404 });
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
    let coverImageUrl = resolveCoverImageUrl(parsed.data, existing);
    if (parsed.data.image) {
      coverImageUrl = await uploadCoverImage(parsed.data.image);
    }

    const data = await updateAdminDisclosure(
      params.id,
      {
        title: parsed.data.title,
        body: parsed.data.body,
        marketType: parsed.data.marketType,
        stockName: parsed.data.stockName,
        stockCode: parsed.data.stockCode,
        membershipType: parsed.data.membershipType,
        coverImageUrl,
      },
      user.email ?? "",
      existing
    );

    return NextResponse.json({ ok: true, id: data.id, createdAt: data.created_at });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "서버 오류";
    if (msg.startsWith("IMAGE_")) {
      return NextResponse.json({ ok: false, error: imageErrorMessage(msg) }, { status: 400 });
    }
    console.error("[admin/publish/update]", msg);
    return NextResponse.json({ ok: false, error: "수정에 실패했습니다." }, { status: 500 });
  }
}

export async function GET(_req: Request, { params }: RouteContext) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const row = await getAdminDisclosureById(params.id);
  if (!row || !isManualEditorPost(row)) {
    return NextResponse.json({ ok: false, error: "기사를 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, item: row });
}
