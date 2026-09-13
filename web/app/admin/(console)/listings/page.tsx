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
          원할 때 업데이트를 누르면 그 시점의 nasdaqlisted.txt · otherlisted.txt와 대조합니다. 워런트·우선주는
          이미 상장된 일반주의 CIK를 받습니다. <span className="text-foreground/80">({user.email})</span>
        </p>
      </header>
      <AdminListingsPanel />
    </main>
  );
}
