import type { Metadata } from "next";
import { AdminNewsComposer } from "@/components/AdminNewsComposer";

export const metadata: Metadata = {
  title: "뉴스 작성",
  robots: { index: false, follow: false },
};

export default function AdminNewsPage() {
  return (
    <main>
      <header className="mb-8 space-y-2 border-b border-slate-100 pb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">뉴스 작성</h1>
        <p className="text-sm text-slate-600">
          비밀번호 입력·잠금 해제는{" "}
          <code className="rounded bg-slate-100 px-1 text-xs">/admin/access/ADMIN_ACCESS_SLUG</code> 에서만
          할 수 있습니다. 일반 방문자가 <code className="rounded bg-slate-100 px-1 text-xs">/admin</code> 주소를
          쳐도 뉴스 피드로만 이동합니다.
        </p>
      </header>
      <AdminNewsComposer />
    </main>
  );
}
