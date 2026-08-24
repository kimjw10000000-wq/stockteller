import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "로그인",
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; next?: string };
}) {
  const initialError =
    searchParams.error === "auth" ? "로그인에 실패했습니다. 다시 시도해 주세요." : "";

  return (
    <main className="flex justify-center py-4">
      <LoginForm initialError={initialError} next={searchParams.next} />
    </main>
  );
}
