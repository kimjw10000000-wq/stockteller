"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { oauthRedirectTo, validateEmail } from "@/lib/auth/validation";
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
      redirectTo: oauthRedirectTo("/reset-password"),
    });
    setLoading(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setInfo("재설정 링크를 보냈습니다. 메일함을 확인해 주세요.");
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-5 rounded-xl border border-border bg-card p-6 shadow-sm">
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="forgot-email" className="text-sm font-medium">
            이메일
          </label>
          <Input
            id="forgot-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
          {loading ? "보내는 중…" : "재설정 링크 받기"}
        </Button>
      </form>
      <p className="text-center text-sm">
        <Link href="/login" className="text-muted-foreground underline-offset-4 hover:underline">
          로그인으로 돌아가기
        </Link>
      </p>
    </div>
  );
}
