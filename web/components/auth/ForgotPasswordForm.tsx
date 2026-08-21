"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  AuthCard,
  AuthError,
  AuthField,
  authInputClass,
  authPrimaryBtnClass,
} from "@/components/auth/AuthCard";
import { authCallbackUrl, validateEmail } from "@/lib/auth/validation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const emailErr = validateEmail(email);
    if (emailErr) {
      setError(emailErr);
      return;
    }
    setLoading(true);
    setError("");
    setInfo("");
    const supabase = createSupabaseBrowserClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: authCallbackUrl("/reset-password"),
    });
    setLoading(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setInfo("재설정 링크를 보냈습니다. 메일함을 확인해 주세요.");
  }

  return (
    <AuthCard title="비밀번호 찾기" subtitle="가입한 이메일로 재설정 링크를 보냅니다.">
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        <AuthField id="forgot-email" label="이메일">
          <input
            id="forgot-email"
            className={authInputClass}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </AuthField>
        <AuthError message={error} />
        {info ? (
          <p className="text-sm text-zinc-200" role="status">
            {info}
          </p>
        ) : null}
        <button type="submit" className={authPrimaryBtnClass} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading ? "보내는 중…" : "재설정 링크 받기"}
        </button>
      </form>
      <p className="mt-5 text-center text-sm">
        <Link href="/login" className="text-zinc-400 underline-offset-4 hover:text-zinc-200 hover:underline">
          로그인으로 돌아가기
        </Link>
      </p>
    </AuthCard>
  );
}
