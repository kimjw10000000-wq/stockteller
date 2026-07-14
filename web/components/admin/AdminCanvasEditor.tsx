"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Rnd } from "react-rnd";
import { ImagePlus, Trash2, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  computeCanvasRenderHeight,
  createCanvasElement,
  createEmptyCanvasDocument,
  parseBodyToCanvasDocument,
  serializeCanvasDocument,
  type CanvasDocument,
  type CanvasElement,
} from "@/lib/canvas-document";

type AdminCanvasEditorProps = {
  value: string;
  onChange: (json: string) => void;
  editorKey?: string;
};

async function uploadCanvasImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.set("image", file);
  const res = await fetch("/api/admin/upload-image", { method: "POST", body: formData });
  const j = (await res.json()) as { ok?: boolean; url?: string; error?: string };
  if (!res.ok || !j.ok || !j.url) {
    throw new Error(j.error ?? "이미지 업로드에 실패했습니다.");
  }
  return j.url;
}

export function AdminCanvasEditor({ value, onChange, editorKey }: AdminCanvasEditorProps) {
  const [doc, setDoc] = useState<CanvasDocument>(() => parseBodyToCanvasDocument(value));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasHeight = useMemo(() => computeCanvasRenderHeight(doc), [doc]);

  useEffect(() => {
    setDoc(parseBodyToCanvasDocument(value));
    setSelectedId(null);
    // draft 전환(editorKey) 시에만 외부 value로 리셋 — 편집 중 부모 state 루프 방지
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorKey]);

  const commit = useCallback(
    (next: CanvasDocument) => {
      setDoc(next);
      onChange(serializeCanvasDocument(next));
    },
    [onChange]
  );

  const updateElement = useCallback(
    (id: string, patch: Partial<CanvasElement>) => {
      commit({
        ...doc,
        elements: doc.elements.map((el) => (el.id === id ? { ...el, ...patch } : el)),
      });
    },
    [commit, doc]
  );

  const addTextBox = () => {
    const offset = doc.elements.length * 24;
    const el = createCanvasElement("text", { x: 48 + offset, y: 48 + offset, zIndex: doc.elements.length + 1 });
    commit({ ...doc, elements: [...doc.elements, el] });
    setSelectedId(el.id);
  };

  const addImageBox = () => {
    fileInputRef.current?.click();
  };

  const onImageSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const url = await uploadCanvasImage(file);
      const offset = doc.elements.length * 24;
      const el = createCanvasElement("image", {
        x: 80 + offset,
        y: 80 + offset,
        content: url,
        zIndex: doc.elements.length + 1,
      });
      commit({ ...doc, elements: [...doc.elements, el] });
      setSelectedId(el.id);
    } catch (err) {
      console.error("[canvas-editor] image upload failed", err);
      window.alert(err instanceof Error ? err.message : "이미지 업로드에 실패했습니다.");
    }
  };

  const removeSelected = () => {
    if (!selectedId) return;
    commit({ ...doc, elements: doc.elements.filter((el) => el.id !== selectedId) });
    setSelectedId(null);
  };

  const clearCanvas = () => {
    if (!window.confirm("캔버스의 모든 요소를 삭제할까요?")) return;
    commit(createEmptyCanvasDocument());
    setSelectedId(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-2">
        <Button type="button" variant="outline" size="sm" className="gap-2" onClick={addTextBox}>
          <Type className="h-4 w-4" />
          텍스트 상자
        </Button>
        <Button type="button" variant="outline" size="sm" className="gap-2" onClick={addImageBox}>
          <ImagePlus className="h-4 w-4" />
          이미지 추가
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 text-destructive hover:text-destructive"
          disabled={!selectedId}
          onClick={removeSelected}
        >
          <Trash2 className="h-4 w-4" />
          선택 삭제
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={clearCanvas}>
          전체 초기화
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => void onImageSelected(e)}
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-[#f8f8fa] p-3">
        <div
          className="relative mx-auto rounded-lg border border-dashed border-border/80 bg-white shadow-inner"
          style={{ width: doc.canvasWidth, height: canvasHeight }}
          onMouseDown={() => setSelectedId(null)}
        >
          {doc.elements.length === 0 ? (
            <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              텍스트 상자 또는 이미지를 추가한 뒤 드래그·리사이즈로 배치하세요.
            </p>
          ) : null}

          {doc.elements.map((el) => (
            <Rnd
              key={el.id}
              bounds="parent"
              size={{ width: el.width, height: el.height }}
              position={{ x: el.x, y: el.y }}
              onDragStop={(_e, data) => updateElement(el.id, { x: data.x, y: data.y })}
              onResizeStop={(_e, _dir, ref, _delta, position) =>
                updateElement(el.id, {
                  width: parseInt(ref.style.width, 10),
                  height: parseInt(ref.style.height, 10),
                  x: position.x,
                  y: position.y,
                })
              }
              onMouseDown={(e) => {
                e.stopPropagation();
                setSelectedId(el.id);
              }}
              className={`box-border ${selectedId === el.id ? "z-20" : "z-10"}`}
              style={{ zIndex: el.zIndex }}
              enableResizing
              dragHandleClassName="canvas-drag-handle"
            >
              <div
                className={`flex h-full w-full flex-col overflow-hidden rounded-md border bg-white shadow-sm ${
                  selectedId === el.id ? "border-primary ring-2 ring-primary/30" : "border-border"
                }`}
              >
                <div className="canvas-drag-handle flex cursor-move items-center justify-between border-b border-border/70 bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">
                  <span>{el.type === "text" ? "텍스트" : "이미지"}</span>
                  <span>드래그</span>
                </div>
                {el.type === "text" ? (
                  <textarea
                    value={el.content}
                    onChange={(e) => updateElement(el.id, { content: e.target.value })}
                    placeholder="내용을 입력하세요"
                    className="h-full w-full resize-none border-0 bg-transparent p-3 text-sm leading-relaxed text-foreground outline-none"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-muted/20 p-2">
                    {el.content ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={el.content}
                        alt=""
                        className="max-h-full max-w-full object-contain"
                        draggable={false}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">이미지 없음</span>
                    )}
                  </div>
                )}
              </div>
            </Rnd>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        PPT/피그마처럼 요소를 자유롭게 배치합니다. 발행 시 위치·크기·내용이 JSON으로 저장됩니다.
      </p>
    </div>
  );
}
