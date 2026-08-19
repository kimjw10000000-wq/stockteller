import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const metadata: Metadata = {
  title: "비밀번호 변경",
};

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto max-w-md py-4">
      <h1 className="mb-6 text-center text-2xl font-semibold text-foreground">새 비밀번호</h1>
      <ResetPasswordForm />
    </main>
  );
}
