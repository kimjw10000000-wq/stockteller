"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Rnd } from "react-rnd";
import { AdminRichTextEditor } from "@/components/admin/AdminRichTextEditor";
import {
  OVERLAY_Z_BASE,
  createOverlayImage,
  parseBodyToOverlayDocument,
  serializeOverlayArticleDocument,
  type OverlayArticleDocument,
  type OverlayImage,
} from "@/lib/canvas-document";
import {
  ARTICLE_CONTENT_MAX_WIDTH,
  parseArticleBlocks,
} from "@/lib/overlay-article-layout";

type AdminOverlayEditorProps = {
  value: string;
  onChange: (json: string) => void;
  editorKey?: string;
  isLoading?: boolean;
};

type BlockMetric = { height: number };
type ContentBox = { top: number; left: number; width: number };

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

export function AdminOverlayEditor({ value, onChange, editorKey, isLoading = false }: AdminOverlayEditorProps) {
  const [doc, setDoc] = useState<OverlayArticleDocument>(() => parseBodyToOverlayDocument(value));
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [blockMetrics, setBlockMetrics] = useState<BlockMetric[]>([]);
  const [contentBox, setContentBox] = useState<ContentBox>({ top: 0, left: 0, width: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorShellRef = useRef<HTMLDivElement>(null);
  const paragraphIndexRef = useRef(0);
  const lastSerializedRef = useRef(serializeOverlayArticleDocument(parseBodyToOverlayDocument(value)));
  const prevEditorKeyRef = useRef(editorKey);

  const blocks = useMemo(() => parseArticleBlocks(doc.content), [doc.content]);
  const contentMaxWidth = doc.contentMaxWidth || ARTICLE_CONTENT_MAX_WIDTH;
  const overlayRowCount = Math.max(blockMetrics.length, blocks.length, 1);

  useEffect(() => {
    const editorKeyChanged = prevEditorKeyRef.current !== editorKey;
    prevEditorKeyRef.current = editorKey;

    if (!editorKeyChanged && value === lastSerializedRef.current) return;

    const parsed = parseBodyToOverlayDocument(value);
    const serialized = serializeOverlayArticleDocument(parsed);
    setDoc(parsed);
    setSelectedImageId(null);
    lastSerializedRef.current = serialized;
  }, [value, editorKey]);

  const syncLayout = useCallback(() => {
    const shell = editorShellRef.current;
    const prose = shell?.querySelector(".ProseMirror");
    if (!shell || !prose) return;

    const shellRect = shell.getBoundingClientRect();
    const proseRect = prose.getBoundingClientRect();
    setContentBox({
      top: proseRect.top - shellRect.top,
      left: proseRect.left - shellRect.left,
      width: proseRect.width,
    });

    const children = Array.from(prose.children) as HTMLElement[];
    setBlockMetrics(children.map((el) => ({ height: el.offsetHeight })));
  }, []);

  useLayoutEffect(() => {
    syncLayout();
    const prose = editorShellRef.current?.querySelector(".ProseMirror");
    if (!prose) return;

    const ro = new ResizeObserver(() => syncLayout());
    ro.observe(prose);
    Array.from(prose.children).forEach((child) => ro.observe(child));
    return () => ro.disconnect();
  }, [doc.content, syncLayout, editorKey]);

  useEffect(() => {
    const onResize = () => syncLayout();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [syncLayout]);

  const commit = useCallback(
    (next: OverlayArticleDocument) => {
      const serialized = serializeOverlayArticleDocument(next);
      lastSerializedRef.current = serialized;
      setDoc(next);
      onChange(serialized);
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
    async (file: File, paragraphIndex?: number) => {
      try {
        const url = await uploadOverlayImage(file);
        const pIdx = paragraphIndex ?? paragraphIndexRef.current;
        const sameBlock = doc.overlay_images.filter((img) => img.paragraphIndex === pIdx);
        const offset = sameBlock.length * 24;
        const image = createOverlayImage(url, {
          paragraphIndex: pIdx,
          x: 8 + offset,
          y: 8 + offset,
          zIndex: OVERLAY_Z_BASE + doc.overlay_images.length,
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

  const removeSelectedImage = () => {
    if (!selectedImageId) return;
    commit({ ...doc, overlay_images: doc.overlay_images.filter((img) => img.id !== selectedImageId) });
    setSelectedImageId(null);
  };

  const imagesByBlock = useMemo(() => {
    const map = new Map<number, OverlayImage[]>();
    for (const img of doc.overlay_images) {
      const idx = Math.max(0, img.paragraphIndex ?? 0);
      const list = map.get(idx) ?? [];
      list.push(img);
      map.set(idx, list);
    }
    return map;
  }, [doc.overlay_images]);

  if (isLoading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center gap-2 rounded-xl border border-border bg-muted/20 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        기존 데이터를 불러오는 중입니다…
      </div>
    );
  }

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
          본문은 워드처럼 바로 입력 · 이미지는 커서 위치 문단에 고정 (드래그/리사이즈/Ctrl+V)
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-[#f8f8fa] p-3">
        <div
          ref={editorShellRef}
          className="relative mx-auto rounded-lg border border-border bg-white shadow-inner"
          style={{ maxWidth: contentMaxWidth }}
          onMouseDown={() => setSelectedImageId(null)}
        >
          <AdminRichTextEditor
            editorKey={editorKey}
            value={doc.content}
            onChange={(html) => commit({ ...doc, content: html })}
            onParagraphIndexChange={(idx) => {
              paragraphIndexRef.current = idx;
            }}
            onImagePaste={(file) => void addOverlayFromFile(file, paragraphIndexRef.current)}
            textOnly
            embedded
            contentMaxWidth={contentMaxWidth}
            placeholder="여기에 본문을 자유롭게 작성하세요."
          />

          <div
            className="pointer-events-none absolute z-20 flex flex-col"
            style={{
              top: contentBox.top,
              left: contentBox.left,
              width: contentBox.width,
            }}
            aria-hidden={doc.overlay_images.length === 0}
          >
            {Array.from({ length: overlayRowCount }).map((_, i) => {
              const blockImages = imagesByBlock.get(i) ?? [];
              const height = blockMetrics[i]?.height ?? 48;
              return (
                <div
                  key={i}
                  className="relative shrink-0"
                  data-paragraph-index={i}
                  style={{ height: Math.max(height, 32) }}
                >
                  {blockImages.map((img) => (
                    <Rnd
                      key={img.id}
                      bounds="parent"
                      size={{ width: img.width, height: img.height }}
                      position={{ x: img.x, y: img.y }}
                      onDragStop={(_e, data) =>
                        updateOverlayImage(img.id, { x: data.x, y: data.y })
                      }
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
                      className="pointer-events-auto z-20"
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
                        <img
                          src={img.src}
                          alt=""
                          className="h-full w-full object-contain"
                          draggable={false}
                        />
                      </div>
                    </Rnd>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
