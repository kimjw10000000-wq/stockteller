import type { Metadata } from "next";
import { AdminPublishForm } from "@/components/admin/AdminPublishForm";

export const metadata: Metadata = {
  title: "뉴스 작성 · 관리자",
  robots: { index: false, follow: false },
};

export default function AdminDashboardPage() {
  return (
    <main className="py-8">
      <header className="mb-8 border-b border-border pb-6">
        <h1 className="text-2xl font-semibold text-foreground">뉴스 작성 대시보드</h1>
        <p className="mt-2 text-sm text-muted-foreground">제목 · 본문 · 이미지를 입력하고 발행하세요.</p>
      </header>
      <AdminPublishForm />
    </main>
  );
}
