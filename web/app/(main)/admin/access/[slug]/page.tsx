import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminUnlockForm } from "@/components/AdminUnlockForm";

export const metadata: Metadata = {
  title: "관리 영역",
  robots: { index: false, follow: false },
};

type PageProps = { params: { slug: string } };

export default function AdminAccessGatePage({ params }: PageProps) {
  const expected = process.env.ADMIN_ACCESS_SLUG?.trim();
  if (!expected || expected.length < 8 || params.slug !== expected) {
    notFound();
  }

  return (
    <main>
      <header className="mb-8 space-y-2 border-b border-slate-100 pb-6 text-center">
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">관리 영역</h1>
        <p className="text-sm text-slate-600">
          이 주소는 즐겨찾기만 해 두세요. 통과 후 같은 브라우저에서는{" "}
          <code className="rounded bg-slate-100 px-1 text-xs">/admin/news</code> 로 바로 들어갈 수 있습니다.
        </p>
      </header>
      <AdminUnlockForm />
    </main>
  );
}
