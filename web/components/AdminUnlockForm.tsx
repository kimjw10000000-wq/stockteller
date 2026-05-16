"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
    <form onSubmit={onSubmit} className="mx-auto max-w-md space-y-5 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="space-y-2">
        <label htmlFor="unlock-secret" className="block text-sm font-medium text-slate-700">
          관리자 비밀번호
        </label>
        <input
          id="unlock-secret"
          type="password"
          autoComplete="current-password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none ring-[#3182f6]/30 focus:border-[#3182f6] focus:ring-4"
          placeholder="ADMIN_NEWS_SECRET 과 동일"
          required
        />
        <p className="text-xs text-slate-500">
          맞으면 이 브라우저에 <strong className="font-medium text-slate-600">30일간</strong> 잠금 해제 쿠키가
          저장됩니다. 다른 사람과 PC를 쓰면 브라우저에서 쿠키 삭제를 해 두세요.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full rounded-xl bg-[#3182f6] py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#1b64da] disabled:opacity-60"
      >
        {status === "loading" ? "확인 중…" : "잠금 해제 후 작성 페이지로"}
      </button>

      <p className="text-center text-xs text-slate-400">
        다음 이동: <code className="rounded bg-slate-50 px-1">{NEXT_AFTER_UNLOCK}</code>
      </p>
    </form>
  );
}
