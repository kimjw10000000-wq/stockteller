"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "admin_news_secret_v1";

export function AdminNewsComposer() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [secret, setSecret] = useState("");
  const [rememberSecret, setRememberSecret] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "ok" | "err">("idle");
  const [message, setMessage] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        setSecret(saved);
        setRememberSecret(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setMessage("");
    setSavedId(null);
    try {
      if (rememberSecret && secret) {
        sessionStorage.setItem(STORAGE_KEY, secret);
      } else {
        sessionStorage.removeItem(STORAGE_KEY);
      }

      const res = await fetch("/api/admin/news", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ title, body }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string; id?: string };

      if (!res.ok || !j.ok) {
        setStatus("err");
        setMessage(j.error ?? "저장에 실패했습니다.");
        return;
      }

      setStatus("ok");
      setMessage("저장되었습니다. 뉴스 피드 상단에 표시됩니다.");
      setSavedId(typeof j.id === "string" ? j.id : null);
      setTitle("");
      setBody("");
    } catch {
      setStatus("err");
      setMessage("네트워크 오류입니다.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="space-y-2">
        <label htmlFor="admin-secret" className="block text-sm font-medium text-slate-700">
          관리자 비밀번호
        </label>
        <input
          id="admin-secret"
          name="admin-secret"
          type="password"
          autoComplete="off"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none ring-[#3182f6]/30 placeholder:text-slate-400 focus:border-[#3182f6] focus:ring-4"
          placeholder="환경 변수 ADMIN_NEWS_SECRET 값"
          required
        />
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={rememberSecret}
            onChange={(e) => setRememberSecret(e.target.checked)}
            className="rounded border-slate-300 text-[#3182f6] focus:ring-[#3182f6]"
          />
          이 브라우저 세션 동안 비밀번호 기억 (이 PC를 다른 사람과 쓰면 끄세요)
        </label>
      </div>

      <div className="space-y-2">
        <label htmlFor="news-title" className="block text-sm font-medium text-slate-700">
          제목
        </label>
        <input
          id="news-title"
          name="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none ring-[#3182f6]/30 placeholder:text-slate-400 focus:border-[#3182f6] focus:ring-4"
          placeholder="뉴스 제목"
          required
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="news-body" className="block text-sm font-medium text-slate-700">
          본문 (복사·붙여넣기 가능)
        </label>
        <textarea
          id="news-body"
          name="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={18}
          spellCheck={false}
          className="w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 font-mono text-sm leading-relaxed text-slate-900 shadow-sm outline-none ring-[#3182f6]/30 placeholder:text-slate-400 focus:border-[#3182f6] focus:ring-4"
          placeholder="기사·공지 등 전체 내용을 붙여 넣으세요."
          required
        />
      </div>

      {message ? (
        <div role="status" className="space-y-2">
          <p className={`text-sm ${status === "err" ? "text-rose-600" : "text-emerald-700"}`}>
            {message}
          </p>
          {savedId ? (
            <Link
              href={`/disclosure/${savedId}`}
              className="inline-block text-sm font-medium text-[#3182f6] underline-offset-4 hover:underline"
            >
              방금 올린 글 보기 →
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={status === "saving"}
          className="inline-flex items-center justify-center rounded-xl bg-[#3182f6] px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-blue-500/25 transition hover:bg-[#1b64da] disabled:opacity-60"
        >
          {status === "saving" ? "저장 중…" : "뉴스로 게시"}
        </button>
        <Link
          href="/feed"
          className="text-sm font-medium text-slate-600 underline-offset-4 hover:text-[#3182f6] hover:underline"
        >
          뉴스 목록 보기
        </Link>
      </div>
    </form>
  );
}
