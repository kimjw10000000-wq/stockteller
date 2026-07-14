"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Rnd } from "react-rnd";
import { ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminRichTextEditor } from "@/components/admin/AdminRichTextEditor";
import {
  createOverlayImage,
  parseBodyToOverlayDocument,
  serializeOverlayArticleDocument,
  type OverlayArticleDocument,
  type OverlayImage,
} from "@/lib/canvas-document";

type AdminOverlayEditorProps = {
  value: string;
  onChange: (json: string) => void;
  editorKey?: string;
};

async function uploadOverlayImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.set("image", file);
  const res = await fetch("/api/admin/upload-image", { method: "POST", body: formData });
  const j = (await res.json()) as { ok?: boolean; url?: string; error?: string };
  if (!res.ok || !j.ok || !j.url) {
    throw new Error(j.error ?? "이미지 업로드에 실패했습니다.");
  }
  return j.url;
}

export function AdminOverlayEditor({ value, onChange, editorKey }: AdminOverlayEditorProps) {
  const [doc, setDoc] = useState<OverlayArticleDocument>(() => parseBodyToOverlayDocument(value));
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDoc(parseBodyToOverlayDocument(value));
    setSelectedImageId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorKey]);

  const commit = useCallback(
    (next: OverlayArticleDocument) => {
      setDoc(next);
      onChange(serializeOverlayArticleDocument(next));
    },
    [onChange]
  );

  const updateOverlayImage = useCallback(
    (id: string, patch: Partial<OverlayImage>) => {
      commit({
        ...doc,
        overlay_images: doc.overlay_images.map((img) => (img.id === id ? { ...img, ...patch } : img)),
      });
    },
    [commit, doc]
  );

  const addOverlayFromFile = useCallback(
    async (file: File) => {
      try {
        const url = await uploadOverlayImage(file);
        const offset = doc.overlay_images.length * 28;
        const image = createOverlayImage(url, {
          x: 72 + offset,
          y: 72 + offset,
          zIndex: 20 + doc.overlay_images.length,
        });
        commit({ ...doc, overlay_images: [...doc.overlay_images, image] });
        setSelectedImageId(image.id);
      } catch (err) {
        console.error("[overlay-editor] upload failed", err);
        window.alert(err instanceof Error ? err.message : "이미지 업로드에 실패했습니다.");
      }
    },
    [commit, doc]
  );

  const onCanvasPaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) void addOverlayFromFile(file);
        return;
      }
    }
  };

  const removeSelectedImage = () => {
    if (!selectedImageId) return;
    commit({ ...doc, overlay_images: doc.overlay_images.filter((img) => img.id !== selectedImageId) });
    setSelectedImageId(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => fileInputRef.current?.click()}
        >
          <ImagePlus className="h-4 w-4" />
          이미지 오버레이 추가
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 text-destructive hover:text-destructive"
          disabled={!selectedImageId}
          onClick={removeSelectedImage}
        >
          <Trash2 className="h-4 w-4" />
          선택 이미지 삭제
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void addOverlayFromFile(file);
          }}
        />
        <p className="text-xs text-muted-foreground">
          본문은 워드처럼 바로 입력 · 이미지는 텍스트 위에 자유 배치 (드래그/리사이즈/Ctrl+V)
        </p>
      </div>

      <div
        ref={canvasRef}
        className="overflow-x-auto rounded-xl border border-border bg-[#f8f8fa] p-3"
        onPaste={onCanvasPaste}
      >
        <div
          className="relative mx-auto rounded-lg border border-border bg-white shadow-inner"
          style={{ width: doc.canvasWidth, minHeight: 480 }}
          onMouseDown={() => setSelectedImageId(null)}
        >
          <div className="relative z-0">
            <AdminRichTextEditor
              editorKey={editorKey}
              value={doc.content}
              onChange={(html) => commit({ ...doc, content: html })}
              textOnly
              embedded
              placeholder="여기에 본문을 자유롭게 작성하세요."
            />
          </div>

          <div className="pointer-events-none absolute inset-0 z-20">
            {doc.overlay_images.map((img) => (
              <Rnd
                key={img.id}
                bounds="parent"
                size={{ width: img.width, height: img.height }}
                position={{ x: img.x, y: img.y }}
                onDragStop={(_e, data) => updateOverlayImage(img.id, { x: data.x, y: data.y })}
                onResizeStop={(_e, _dir, ref, _delta, position) =>
                  updateOverlayImage(img.id, {
                    width: parseInt(ref.style.width, 10),
                    height: parseInt(ref.style.height, 10),
                    x: position.x,
                    y: position.y,
                  })
                }
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setSelectedImageId(img.id);
                }}
                className="pointer-events-auto"
                style={{ zIndex: img.zIndex }}
                enableResizing
              >
                <div
                  className={`h-full w-full overflow-hidden rounded-md border bg-white/95 shadow-md ${
                    selectedImageId === img.id
                      ? "border-primary ring-2 ring-primary/40"
                      : "border-border/80"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.src} alt="" className="h-full w-full object-contain" draggable={false} />
                </div>
              </Rnd>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
