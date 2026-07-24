import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminCompliancePanel } from "@/components/admin/AdminCompliancePanel";
import { isAdminEmail } from "@/lib/admin-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "상장유지 D-Day 관리 · 관리자",
  robots: { index: false, follow: false },
};

export default async function AdminCompliancePage() {
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
        <h1 className="text-2xl font-semibold text-foreground">상장유지 D-Day 관리</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          스몰캡 종목의 Notice Date·유예 상태·D-Day를 등록하고 현황을 확인합니다.{" "}
          <span className="text-foreground/80">({user.email})</span>
        </p>
      </header>
      <AdminCompliancePanel />
    </main>
  );
}
