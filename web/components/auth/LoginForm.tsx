"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  AuthCard,
  AuthError,
  AuthField,
  AuthToast,
  authInputClass,
  authPrimaryBtnClass,
} from "@/components/auth/AuthCard";
import { AUTH_HOME, mapAuthError, validateEmail } from "@/lib/auth/validation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type LoginFormProps = {
  initialError?: string;
};

export function LoginForm({ initialError = "" }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const emailErr = validateEmail(email);
    if (emailErr) {
      setError(emailErr);
      return;
    }
    if (!password) {
      setError("비밀번호를 입력해 주세요.");
      return;
    }
    setLoading(true);
    setError("");
    const supabase = createSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (signInError) {
      setError(mapAuthError(signInError.message, signInError.code));
      return;
    }
    setToast("로그인되었습니다.");
    window.setTimeout(() => {
      router.replace(AUTH_HOME);
      router.refresh();
    }, 700);
  }

  return (
    <>
      <AuthToast message={toast} />
      <AuthCard title="로그인" subtitle="이메일과 비밀번호로 로그인합니다.">
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          <AuthField id="login-email" label="이메일">
            <input
              id="login-email"
              className={authInputClass}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </AuthField>
          <AuthField id="login-password" label="비밀번호">
            <input
              id="login-password"
              className={authInputClass}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </AuthField>
          <p className="text-right text-sm">
            <Link
              href="/forgot-password"
              className="text-zinc-400 underline-offset-4 transition-colors hover:text-zinc-200 hover:underline"
            >
              비밀번호를 잊으셨나요?
            </Link>
          </p>
          <AuthError message={error} />
          <button type="submit" className={authPrimaryBtnClass} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? "로그인 중…" : "로그인"}
          </button>
        </form>
        <p className="mt-5 text-center text-sm text-zinc-400">
          계정이 없나요?{" "}
          <Link href="/signup" className="font-medium text-zinc-100 underline-offset-4 hover:underline">
            회원가입
          </Link>
        </p>
      </AuthCard>
    </>
  );
}
