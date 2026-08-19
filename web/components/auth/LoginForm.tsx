"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mapAuthError, validateEmail } from "@/lib/auth/validation";
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
    router.replace("/");
    router.refresh();
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
          <label htmlFor="login-email" className="text-sm font-medium">
            이메일
          </label>
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="login-password" className="text-sm font-medium">
            비밀번호
          </label>
          <Input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <p className="text-right text-sm">
          <Link href="/forgot-password" className="text-muted-foreground underline-offset-4 hover:underline">
            비밀번호를 잊으셨나요?
          </Link>
        </p>
        {error ? (
          <p className="text-sm text-red-500" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "로그인 중…" : "로그인"}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        계정이 없나요?{" "}
        <Link href="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">
          회원가입
        </Link>
      </p>
    </div>
  );
}
