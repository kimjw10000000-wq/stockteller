import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin-auth";
import { uploadCoverImage } from "@/lib/admin-publish-service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const maxDuration = 60;

function imageErrorMessage(code: string): string {
  switch (code) {
    case "IMAGE_TYPE":
      return "이미지는 JPG, PNG, WebP, GIF만 업로드할 수 있습니다.";
    case "IMAGE_SIZE":
      return "이미지는 5MB 이하여야 합니다.";
    case "IMAGE_UPLOAD":
      return "이미지 업로드에 실패했습니다.";
    default:
      return "업로드에 실패했습니다.";
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

  const image = formData.get("image");
  if (!(image instanceof File) || image.size === 0) {
    return NextResponse.json({ ok: false, error: "이미지 파일을 선택해 주세요." }, { status: 400 });
  }

  try {
    const url = await uploadCoverImage(image);
    if (!url) {
      return NextResponse.json({ ok: false, error: "이미지 업로드에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "서버 오류";
    if (msg.startsWith("IMAGE_")) {
      return NextResponse.json({ ok: false, error: imageErrorMessage(msg) }, { status: 400 });
    }
    console.error("[admin/upload-image]", msg);
    return NextResponse.json({ ok: false, error: "이미지 업로드에 실패했습니다." }, { status: 500 });
  }
}
