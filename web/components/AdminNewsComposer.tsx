"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
      if (rememberSecret && secret) sessionStorage.setItem(STORAGE_KEY, secret);
      else sessionStorage.removeItem(STORAGE_KEY);

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
      setMessage("저장되었습니다. 뉴스 피드에 표시됩니다.");
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
        <label htmlFor="admin-secret" className="block text-sm font-medium text-foreground">
          관리자 비밀번호
        </label>
        <Input
          id="admin-secret"
          type="password"
          autoComplete="off"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="ADMIN_NEWS_SECRET"
          required
        />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={rememberSecret}
            onChange={(e) => setRememberSecret(e.target.checked)}
            className="rounded border-border"
          />
          이 브라우저 세션 동안 비밀번호 기억
        </label>
      </div>

      <div className="space-y-2">
        <label htmlFor="news-title" className="block text-sm font-medium text-foreground">
          제목
        </label>
        <Input
          id="news-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="뉴스 제목"
          required
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="news-body" className="block text-sm font-medium text-foreground">
          본문 (복사·붙여넣기 가능)
        </label>
        <textarea
          id="news-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={18}
          spellCheck={false}
          className="w-full resize-y rounded-md border border-border bg-input-background px-3 py-2 font-mono text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          placeholder="기사·공지 등 전체 내용을 붙여 넣으세요."
          required
        />
      </div>

      {message ? (
        <div role="status" className="space-y-2">
          <p className={`text-sm ${status === "err" ? "text-destructive" : "text-green-600"}`}>
            {message}
          </p>
          {savedId ? (
            <Link href={`/disclosure/${savedId}`} className="text-sm font-medium text-foreground underline">
              방금 올린 글 보기 →
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={status === "saving"}>
          {status === "saving" ? "저장 중…" : "뉴스로 게시"}
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/feed">뉴스 목록 보기</Link>
        </Button>
      </div>
    </form>
  );
}
