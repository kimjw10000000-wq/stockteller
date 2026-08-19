import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "로그인",
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const initialError =
    searchParams.error === "auth" ? "로그인에 실패했습니다. 다시 시도해 주세요." : "";

  return (
    <main className="mx-auto max-w-md py-4">
      <h1 className="mb-6 text-center text-2xl font-semibold text-foreground">로그인</h1>
      <LoginForm initialError={initialError} />
    </main>
  );
}
