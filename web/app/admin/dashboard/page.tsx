import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminDashboardShell } from "@/components/admin/AdminDashboardShell";
import { isAdminEmail } from "@/lib/admin-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "뉴스 작성 · 관리자",
  robots: { index: false, follow: false },
};

export default async function AdminDashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) {
    redirect("/admin");
  }

  return (
    <main className="py-8">
      <header className="mb-8 border-b border-border pb-6">
        <h1 className="text-2xl font-semibold text-foreground">뉴스 작성 대시보드</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          시장·종목·유무료 설정 후 발행하거나, 우측 목록에서 기존 글을 수정하세요.{" "}
          <span className="text-foreground/80">({user.email})</span>
        </p>
      </header>
      <AdminDashboardShell />
    </main>
  );
}
