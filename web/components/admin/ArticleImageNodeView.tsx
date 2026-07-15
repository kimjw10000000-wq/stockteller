"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { AlignCenter, AlignLeft, AlignRight, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

const MIN_WIDTH = 120;
const MAX_WIDTH = 768;

type AlignValue = "left" | "center" | "right";

export function ArticleImageNodeView({
  node,
  updateAttributes,
  selected,
  editor,
  getPos,
}: NodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const resizingRef = useRef(false);

  const src = String(node.attrs.src ?? "");
  const alt = String(node.attrs.alt ?? "");
  const align = (node.attrs.align as AlignValue) || "center";
  const width = node.attrs.width ? Number(node.attrs.width) : null;

  const onImgLoad = () => {
    const img = imgRef.current;
    if (!img) return;
    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    if (!width && img.naturalWidth) {
      const initial = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, img.naturalWidth));
      updateAttributes({ width: initial });
    }
  };

  const setAlign = (next: AlignValue) => {
    updateAttributes({ align: next });
    editor.commands.focus();
  };

  const startResize = useCallback(
    (e: React.MouseEvent, corner: "se" | "sw") => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startWidth = width || imgRef.current?.getBoundingClientRect().width || 320;
      resizingRef.current = true;

      const onMove = (ev: MouseEvent) => {
        if (!resizingRef.current) return;
        const delta = corner === "se" ? ev.clientX - startX : startX - ev.clientX;
        const next = Math.round(
          Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + delta))
        );
        updateAttributes({ width: next });
      };

      const onUp = () => {
        resizingRef.current = false;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        editor.commands.focus();
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [editor, updateAttributes, width]
  );

  useEffect(() => {
    return () => {
      resizingRef.current = false;
    };
  }, []);

  const selectNode = (e: React.MouseEvent) => {
    e.preventDefault();
    const pos = typeof getPos === "function" ? getPos() : null;
    if (typeof pos === "number") {
      editor.chain().setNodeSelection(pos).run();
    }
  };

  return (
    <NodeViewWrapper
      as="div"
      className={cn(
        "article-image-block",
        `align-${align}`,
        selected && "is-selected"
      )}
      data-drag-handle
      data-align={align}
      style={width ? { width: `${width}px` } : undefined}
    >
      <div className="article-image-inner" contentEditable={false}>
        <button
          type="button"
          className="article-image-drag-handle"
          aria-label="이미지 위치 이동"
          title="드래그하여 문단 사이로 이동"
          onMouseDown={selectNode}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          className="article-image-img"
          draggable={false}
          onLoad={onImgLoad}
          onClick={selectNode}
          style={
            width
              ? { width: "100%", height: "auto" }
              : naturalSize
                ? { maxWidth: "100%", height: "auto" }
                : undefined
          }
        />

        {selected ? (
          <>
            <div className="article-image-bubble" contentEditable={false}>
              <button
                type="button"
                className={cn("article-image-bubble-btn", align === "left" && "active")}
                onClick={() => setAlign("left")}
                title="왼쪽 정렬 (글 감싸기)"
                aria-label="왼쪽 정렬"
              >
                <AlignLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className={cn("article-image-bubble-btn", align === "center" && "active")}
                onClick={() => setAlign("center")}
                title="가운데 정렬"
                aria-label="가운데 정렬"
              >
                <AlignCenter className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className={cn("article-image-bubble-btn", align === "right" && "active")}
                onClick={() => setAlign("right")}
                title="오른쪽 정렬 (글 감싸기)"
                aria-label="오른쪽 정렬"
              >
                <AlignRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <span
              className="article-image-resize se"
              onMouseDown={(e) => startResize(e, "se")}
              aria-hidden
            />
            <span
              className="article-image-resize sw"
              onMouseDown={(e) => startResize(e, "sw")}
              aria-hidden
            />
          </>
        ) : null}
      </div>
    </NodeViewWrapper>
  );
}
