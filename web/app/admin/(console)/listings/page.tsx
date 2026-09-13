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
          이 화면에는 목록 A(거래소에만 있음)와 목록 B(DB에만 있음)만 올립니다. 전체 파일 대조는 Cursor에서
          「목록 업데이트 돌려줘」로 돌립니다. <span className="text-foreground/80">({user.email})</span>
        </p>
      </header>
      <AdminListingsPanel />
    </main>
  );
}
