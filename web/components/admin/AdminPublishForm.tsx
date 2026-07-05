"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function AdminPublishForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "publishing" | "ok" | "err">("idle");
  const [message, setMessage] = useState("");
  const [publishedId, setPublishedId] = useState<string | null>(null);

  function onImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setImage(file);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("publishing");
    setMessage("");
    setPublishedId(null);

    const formData = new FormData();
    formData.set("title", title);
    formData.set("body", body);
    if (image) formData.set("image", image);

    try {
      const res = await fetch("/api/admin/publish", {
        method: "POST",
        body: formData,
      });
      const j = (await res.json()) as { ok?: boolean; error?: string; id?: string };

      if (!res.ok || !j.ok) {
        setStatus("err");
        setMessage(j.error ?? "발행에 실패했습니다.");
        return;
      }

      setStatus("ok");
      setMessage("발행되었습니다. 메인 피드에 곧 표시됩니다.");
      setPublishedId(typeof j.id === "string" ? j.id : null);
      setTitle("");
      setBody("");
      setImage(null);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(null);
      router.refresh();
    } catch {
      setStatus("err");
      setMessage("네트워크 오류입니다.");
    }
  }

  async function onLogout() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/admin");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">뉴스 기사를 작성하고 [발행]하면 /feed에 즉시 반영됩니다.</p>
        <Button type="button" variant="outline" size="sm" onClick={onLogout}>
          로그아웃
        </Button>
      </div>

      <form onSubmit={onSubmit} className="space-y-5 rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="space-y-2">
          <label htmlFor="publish-title" className="block text-sm font-medium text-foreground">
            제목
          </label>
          <Input
            id="publish-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="뉴스 제목"
            required
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="publish-body" className="block text-sm font-medium text-foreground">
            본문
          </label>
          <textarea
            id="publish-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={14}
            spellCheck
            className="w-full resize-y rounded-md border border-border bg-input-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            placeholder="기사 본문 (복사·붙여넣기 가능)"
            required
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="publish-image" className="block text-sm font-medium text-foreground">
            대표 이미지 (선택)
          </label>
          <Input
            id="publish-image"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={onImageChange}
          />
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="미리보기" className="mt-2 max-h-48 rounded-lg border border-border object-cover" />
          ) : null}
        </div>

        {message ? (
          <div role="status" className="space-y-2">
            <p className={`text-sm ${status === "err" ? "text-destructive" : "text-green-600"}`}>{message}</p>
            {publishedId ? (
              <Link href={`/disclosure/${publishedId}`} className="text-sm font-medium text-foreground underline">
                발행된 글 보기 →
              </Link>
            ) : null}
          </div>
        ) : null}

        <Button type="submit" disabled={status === "publishing"} size="lg">
          {status === "publishing" ? "발행 중…" : "발행"}
        </Button>
      </form>
    </div>
  );
}
