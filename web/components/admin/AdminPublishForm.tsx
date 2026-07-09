"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AdminMarketType } from "@/lib/admin-publish-market";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const MARKET_OPTIONS: { key: AdminMarketType; label: string }[] = [
  { key: "us", label: "미국주식" },
  { key: "kr", label: "한국주식" },
];

export function AdminPublishForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [marketType, setMarketType] = useState<AdminMarketType>("us");
  const [stockName, setStockName] = useState("");
  const [stockCode, setStockCode] = useState("");
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

  function onMarketChange(next: AdminMarketType) {
    setMarketType(next);
    setStockName("");
    setStockCode("");
  }

  function onKrCodeChange(e: React.ChangeEvent<HTMLInputElement>) {
    setStockCode(e.target.value.replace(/\D/g, "").slice(0, 6));
  }

  function onUsTickerChange(e: React.ChangeEvent<HTMLInputElement>) {
    setStockCode(e.target.value.toUpperCase().replace(/[^A-Z0-9.-]/g, "").slice(0, 12));
  }

  function resetForm() {
    setTitle("");
    setBody("");
    setMarketType("us");
    setStockName("");
    setStockCode("");
    setImage(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("publishing");
    setMessage("");
    setPublishedId(null);

    const formData = new FormData();
    formData.set("title", title);
    formData.set("body", body);
    formData.set("market_type", marketType);
    formData.set("stock_name", stockName);
    formData.set("stock_code", stockCode);
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
      resetForm();
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
        <p className="text-sm text-muted-foreground">
          뉴스 기사를 작성하고 [발행]하면 /feed에 즉시 반영됩니다. 시장(미국·한국)을 선택하면 피드 필터와
          연동됩니다.
        </p>
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

        <div className="space-y-3 border-t border-border pt-5">
          <p className="text-sm font-medium text-foreground">시장 · 종목</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="시장 선택">
            {MARKET_OPTIONS.map(({ key, label }) => (
              <Button
                key={key}
                type="button"
                variant={marketType === key ? "default" : "outline"}
                size="sm"
                role="radio"
                aria-checked={marketType === key}
                onClick={() => onMarketChange(key)}
              >
                {label}
              </Button>
            ))}
          </div>

          {marketType === "us" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="publish-stock-name-us" className="block text-sm font-medium text-foreground">
                  주식 이름
                </label>
                <Input
                  id="publish-stock-name-us"
                  value={stockName}
                  onChange={(e) => setStockName(e.target.value)}
                  placeholder="예: 애플"
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="publish-stock-code-us" className="block text-sm font-medium text-foreground">
                  티커
                </label>
                <Input
                  id="publish-stock-code-us"
                  value={stockCode}
                  onChange={onUsTickerChange}
                  placeholder="예: AAPL"
                  className="font-mono uppercase"
                  required
                />
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="publish-stock-name-kr" className="block text-sm font-medium text-foreground">
                  주식 이름
                </label>
                <Input
                  id="publish-stock-name-kr"
                  value={stockName}
                  onChange={(e) => setStockName(e.target.value)}
                  placeholder="예: 삼성전자"
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="publish-stock-code-kr" className="block text-sm font-medium text-foreground">
                  종목 코드
                </label>
                <Input
                  id="publish-stock-code-kr"
                  value={stockCode}
                  onChange={onKrCodeChange}
                  placeholder="예: 005930"
                  inputMode="numeric"
                  pattern="\d{4,6}"
                  className="font-mono"
                  required
                />
                <p className="text-xs text-muted-foreground">숫자 4~6자리만 입력됩니다.</p>
              </div>
            </div>
          )}
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
