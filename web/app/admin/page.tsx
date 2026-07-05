import type { Metadata } from "next";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";

export const metadata: Metadata = {
  title: "관리자 로그인",
  robots: { index: false, follow: false },
};

type AdminLoginPageProps = {
  searchParams?: { next?: string };
};

export default function AdminLoginPage({ searchParams }: AdminLoginPageProps) {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-12">
      <header className="mb-8 max-w-md text-center">
        <h1 className="text-2xl font-semibold text-foreground">관리자 로그인</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Supabase Authentication에 등록된 관리자 계정으로 로그인하세요.
        </p>
      </header>
      <AdminLoginForm nextPath={searchParams?.next} />
    </main>
  );
}
