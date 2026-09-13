import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminListingsPanel } from "@/components/admin/AdminListingsPanel";
import { isAdminEmail } from "@/lib/admin-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "목록 관리 · 관리자",
  robots: { index: false, follow: false },
};

export default async function AdminListingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) {
    redirect("/admin");
  }

  return (
    <main>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">목록 관리</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          거래소 파일과 DB 대조는 Cursor에서 「목록 업데이트 돌려줘」라고 하면 제한 시간 없이 끝까지 돌립니다. 이
          화면은 목록 A(신규상장 / 티커변경)용입니다. <span className="text-foreground/80">({user.email})</span>
        </p>
      </header>
      <AdminListingsPanel />
    </main>
  );
}
