"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mapAuthError, oauthRedirectTo, validateEmail, validatePassword } from "@/lib/auth/validation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function SignupForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
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
    const pwErr = validatePassword(password);
    if (pwErr) {
      setError(pwErr);
      return;
    }
    if (password !== confirm) {
      setError("비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    setLoading(true);
    setError("");
    setInfo("");
    const supabase = createSupabaseBrowserClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: oauthRedirectTo("/") },
    });
    setLoading(false);

    if (signUpError) {
      setError(mapAuthError(signUpError.message, signUpError.code));
      return;
    }
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      setError("이미 가입된 이메일입니다. 로그인하거나 비밀번호 찾기를 이용해 주세요.");
      return;
    }

    if (data.session) {
      router.replace("/");
      router.refresh();
      return;
    }
    setInfo("가입 확인 메일을 보냈습니다. 메일함의 링크를 눌러 주세요.");
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-5 rounded-xl border border-border bg-card p-6 shadow-sm">
      <OAuthButtons />
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <p className="relative mx-auto w-fit bg-card px-2 text-xs text-muted-foreground">또는 이메일</p>
      </div>
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="signup-email" className="text-sm font-medium">
            이메일
          </label>
          <Input
            id="signup-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="signup-password" className="text-sm font-medium">
            비밀번호
          </label>
          <Input
            id="signup-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <p className="text-xs text-muted-foreground">8자 이상, 영문과 숫자를 함께 사용하세요.</p>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="signup-confirm" className="text-sm font-medium">
            비밀번호 확인
          </label>
          <Input
            id="signup-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </div>
        {error ? (
          <p className="text-sm text-red-500" role="alert">
            {error}
          </p>
        ) : null}
        {info ? (
          <p className="text-sm text-foreground" role="status">
            {info}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "가입 중…" : "회원가입"}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        이미 계정이 있나요?{" "}
        <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
          로그인
        </Link>
      </p>
    </div>
  );
}
