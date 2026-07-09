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

type SessionErrorBody = {
  reason?: string;
};

function sessionErrorMessage(reason: string | undefined): string {
  switch (reason) {
    case "no_user":
      return "로그인 세션이 서버에 전달되지 않았습니다. 브라우저 쿠키를 허용한 뒤 다시 시도해 주세요.";
    case "admin_emails_not_configured":
      return "서버에 ADMIN_EMAILS 환경 변수가 설정되어 있지 않습니다. .env.local 또는 Vercel 설정을 확인하세요.";
    case "not_admin":
      return "등록된 관리자 계정이 아닙니다. ADMIN_EMAILS에 등록된 이메일만 접근할 수 있습니다.";
    default:
      return "관리자 인증에 실패했습니다. 잠시 후 다시 시도해 주세요.";
  }
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
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError || !signInData.session) {
        setStatus("err");
        setError("이메일 또는 비밀번호가 올바르지 않습니다.");
        return;
      }

      const sessionRes = await fetch("/api/admin/session", {
        credentials: "include",
        cache: "no-store",
      });

      if (!sessionRes.ok) {
        let reason: string | undefined;
        try {
          const body = (await sessionRes.json()) as SessionErrorBody;
          reason = body.reason;
        } catch {
          /* ignore */
        }

        if (reason === "no_user" && signInData.session) {
          router.replace(safeAdminNextPath(nextPath));
          router.refresh();
          return;
        }

        if (reason === "not_admin" || reason === "admin_emails_not_configured") {
          await supabase.auth.signOut();
        }

        setStatus("err");
        setError(sessionErrorMessage(reason));
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
