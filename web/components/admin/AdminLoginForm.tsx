"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type AdminLoginFormProps = {
  nextPath?: string;
};

function safeAdminNextPath(raw: string | undefined): string {
  if (!raw || !raw.startsWith("/admin") || raw.startsWith("//")) {
    return "/admin/dashboard";
  }
  return raw;
}

export function AdminLoginForm({ nextPath }: AdminLoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "err">("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setError("");

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        setStatus("err");
        setError("이메일 또는 비밀번호가 올바르지 않습니다.");
        return;
      }

      const sessionRes = await fetch("/api/admin/session");
      if (!sessionRes.ok) {
        await supabase.auth.signOut();
        setStatus("err");
        setError("등록된 관리자 계정이 아닙니다. ADMIN_EMAILS에 등록된 이메일만 접근할 수 있습니다.");
        return;
      }

      router.replace(safeAdminNextPath(nextPath));
      router.refresh();
    } catch {
      setStatus("err");
      setError("로그인 중 오류가 발생했습니다.");
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto w-full max-w-md space-y-5 rounded-xl border border-border bg-card p-6 shadow-sm"
    >
      <div className="space-y-2">
        <label htmlFor="admin-email" className="block text-sm font-medium text-foreground">
          관리자 이메일
        </label>
        <Input
          id="admin-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Supabase Authentication에 등록한 이메일"
          required
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="admin-password" className="block text-sm font-medium text-foreground">
          비밀번호
        </label>
        <Input
          id="admin-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <p className="text-xs text-muted-foreground">
          비밀번호는 Supabase 대시보드(Authentication → Users)에서 설정한 값을 사용하세요.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={status === "loading"} className="w-full">
        {status === "loading" ? "로그인 중…" : "관리자 로그인"}
      </Button>
    </form>
  );
}
