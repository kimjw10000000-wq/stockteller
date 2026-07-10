"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AdminMarketType } from "@/lib/admin-publish-market";
import type { AdminEditDraft } from "@/lib/admin-edit-draft";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  DEFAULT_SIGNAL_STATUS,
  SIGNAL_LABELS,
  SIGNAL_STATUSES,
  type SignalStatus,
} from "@/lib/signal-status";

const MARKET_OPTIONS: { key: AdminMarketType; label: string }[] = [
  { key: "us", label: "미국주식" },
  { key: "kr", label: "한국주식" },
];

const SIGNAL_RING: Record<SignalStatus, string> = {
  positive: "ring-green-500/60",
  neutral: "ring-slate-400/60",
  caution: "ring-yellow-500/60",
  danger: "ring-red-500/60",
};

type AdminPublishFormProps = {
  editDraft: AdminEditDraft | null;
  onCancelEdit: () => void;
  onSaved: () => void;
};

export function AdminPublishForm({ editDraft, onCancelEdit, onSaved }: AdminPublishFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [marketType, setMarketType] = useState<AdminMarketType>("us");
  const [stockName, setStockName] = useState("");
  const [stockCode, setStockCode] = useState("");
  const [signalStatus, setSignalStatus] = useState<SignalStatus>(DEFAULT_SIGNAL_STATUS);
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [existingCoverUrl, setExistingCoverUrl] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [status, setStatus] = useState<"idle" | "publishing" | "ok" | "err">("idle");
  const [message, setMessage] = useState("");
  const [publishedId, setPublishedId] = useState<string | null>(null);

  const isEditing = Boolean(editDraft?.id);

  const applyDraft = useCallback((draft: AdminEditDraft | null) => {
    if (!draft) {
      setTitle("");
      setBody("");
      setMarketType("us");
      setStockName("");
      setStockCode("");
      setSignalStatus(DEFAULT_SIGNAL_STATUS);
      setImage(null);
      setExistingCoverUrl(null);
      setRemoveImage(false);
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }
    setTitle(draft.title);
    setBody(draft.body);
    setMarketType(draft.marketType);
    setStockName(draft.stockName);
    setStockCode(draft.stockCode);
    setSignalStatus(draft.signalStatus);
    setExistingCoverUrl(draft.coverImageUrl);
    setImage(null);
    setRemoveImage(false);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  useEffect(() => {
    applyDraft(editDraft);
  }, [editDraft, applyDraft]);

  function onImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setImage(file);
    setRemoveImage(false);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  function onMarketChange(next: AdminMarketType) {
    setMarketType(next);
    if (!isEditing) {
      setStockName("");
      setStockCode("");
    }
  }

  function onKrCodeChange(e: React.ChangeEvent<HTMLInputElement>) {
    setStockCode(e.target.value.replace(/\D/g, "").slice(0, 6));
  }

  function onUsTickerChange(e: React.ChangeEvent<HTMLInputElement>) {
    setStockCode(e.target.value.toUpperCase().replace(/[^A-Z0-9.-]/g, "").slice(0, 12));
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
    formData.set("signal_status", signalStatus);
    if (image) formData.set("image", image);
    if (removeImage) formData.set("remove_image", "1");

    const url = isEditing ? `/api/admin/publish/${editDraft!.id}` : "/api/admin/publish";
    const method = isEditing ? "PUT" : "POST";

    try {
      const res = await fetch(url, { method, body: formData });
      const j = (await res.json()) as { ok?: boolean; error?: string; id?: string };

      if (!res.ok || !j.ok) {
        setStatus("err");
        setMessage(j.error ?? (isEditing ? "수정에 실패했습니다." : "발행에 실패했습니다."));
        return;
      }

      setStatus("ok");
      setMessage(isEditing ? "수정되었습니다." : "발행되었습니다. 메인 피드에 곧 반영됩니다.");
      setPublishedId(typeof j.id === "string" ? j.id : null);
      if (!isEditing) applyDraft(null);
      onSaved();
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

  const coverPreview = preview ?? (!removeImage ? existingCoverUrl : null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {isEditing ? "선택한 기사를 수정한 뒤 [수정 저장]을 누르세요." : "시장을 먼저 선택하고 기사를 작성하세요."}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={onLogout}>
          로그아웃
        </Button>
      </div>

      <form onSubmit={onSubmit} className="space-y-5 rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="space-y-3">
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
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">공시·뉴스 항해 레이더</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="항해 레이더 등급">
            {SIGNAL_STATUSES.map((key) => (
              <Button
                key={key}
                type="button"
                variant={signalStatus === key ? "default" : "outline"}
                size="sm"
                role="radio"
                aria-checked={signalStatus === key}
                className={signalStatus === key ? `ring-2 ${SIGNAL_RING[key]}` : undefined}
                onClick={() => setSignalStatus(key)}
              >
                {SIGNAL_LABELS[key]}
              </Button>
            ))}
          </div>
        </div>

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
          {coverPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverPreview} alt="미리보기" className="mt-2 max-h-48 rounded-lg border border-border object-cover" />
          ) : null}
          {isEditing && existingCoverUrl ? (
            <label className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={removeImage}
                onChange={(e) => {
                  setRemoveImage(e.target.checked);
                  if (e.target.checked) {
                    setImage(null);
                    if (preview) URL.revokeObjectURL(preview);
                    setPreview(null);
                  }
                }}
              />
              기존 이미지 제거
            </label>
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

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={status === "publishing"} size="lg">
            {status === "publishing" ? "저장 중…" : isEditing ? "수정 저장" : "발행"}
          </Button>
          {isEditing ? (
            <Button type="button" variant="outline" size="lg" onClick={onCancelEdit}>
              수정 취소
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
