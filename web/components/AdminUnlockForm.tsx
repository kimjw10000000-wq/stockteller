"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const NEXT_AFTER_UNLOCK = "/admin/news";

export function AdminUnlockForm() {
  const router = useRouter();
  const [secret, setSecret] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "err">("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/admin/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, next: NEXT_AFTER_UNLOCK }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string; next?: string };
      if (!res.ok || !j.ok) {
        setStatus("err");
        setError(j.error ?? "실패했습니다.");
        return;
      }
      router.replace(typeof j.next === "string" ? j.next : NEXT_AFTER_UNLOCK);
      router.refresh();
    } catch {
      setStatus("err");
      setError("네트워크 오류입니다.");
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto max-w-md space-y-5 rounded-xl border border-border bg-card p-6 shadow-sm"
    >
      <div className="space-y-2">
        <label htmlFor="unlock-secret" className="block text-sm font-medium text-foreground">
          관리자 비밀번호
        </label>
        <Input
          id="unlock-secret"
          type="password"
          autoComplete="current-password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="ADMIN_NEWS_SECRET"
          required
        />
        <p className="text-xs text-muted-foreground">
          맞으면 이 브라우저에 30일간 잠금 해제 쿠키가 저장됩니다.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={status === "loading"} className="w-full">
        {status === "loading" ? "확인 중…" : "잠금 해제 후 작성 페이지로"}
      </Button>
    </form>
  );
}
