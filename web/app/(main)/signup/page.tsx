import type { Metadata } from "next";
import { SignupForm } from "@/components/auth/SignupForm";

export const metadata: Metadata = {
  title: "회원가입",
};

export default function SignupPage() {
  return (
    <main className="mx-auto max-w-md py-4">
      <h1 className="mb-6 text-center text-2xl font-semibold text-foreground">회원가입</h1>
      <SignupForm />
    </main>
  );
}
