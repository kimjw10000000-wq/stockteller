import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminDilutionPreview } from "@/components/admin/AdminDilutionPreview";
import { isAdminEmail } from "@/lib/admin-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "희석 뉴스 요약 · 관리자",
  robots: { index: false, follow: false },
};

export default async function AdminDilutionPage() {
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
        <h1 className="text-2xl font-semibold text-foreground">희석 뉴스 요약</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          보도자료·8-K 원문을 붙여 넣으면 지분희석 여부와 영어 요약만 나옵니다.{" "}
          <span className="text-foreground/80">({user.email})</span>
        </p>
      </header>
      <AdminDilutionPreview />
    </main>
  );
}
