import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = {
  title: "비밀번호 찾기",
};

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto max-w-md py-4">
      <h1 className="mb-2 text-center text-2xl font-semibold text-foreground">비밀번호 찾기</h1>
      <p className="mb-6 text-center text-sm text-muted-foreground">가입한 이메일로 재설정 링크를 보냅니다.</p>
      <ForgotPasswordForm />
    </main>
  );
}
