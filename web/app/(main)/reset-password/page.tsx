import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const metadata: Metadata = {
  title: "비밀번호 변경",
};

export default function ResetPasswordPage() {
  return (
    <main className="flex justify-center py-4">
      <ResetPasswordForm />
    </main>
  );
}
