"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";
import { cn } from "@/lib/utils";

const MIN_SIZE = 40;
const MAX_WIDTH = 768;
const MAX_HEIGHT = 2000;

type AlignValue = "left" | "center" | "right";
type ResizeHandle = "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w";

const RESIZE_HANDLES: ResizeHandle[] = ["nw", "n", "ne", "w", "e", "sw", "s", "se"];

function clamp(n: number, min: number, max: number) {
  return Math.round(Math.max(min, Math.min(max, n)));
}

export function ArticleImageNodeView({
  node,
  updateAttributes,
  selected,
  editor,
  getPos,
}: NodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const resizingRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  const src = String(node.attrs.src ?? "");
  const alt = String(node.attrs.alt ?? "");
  const align = (node.attrs.align as AlignValue) || "center";
  const width = node.attrs.width != null ? Number(node.attrs.width) : null;
  const height = node.attrs.height != null ? Number(node.attrs.height) : null;
  const distorted = width != null && height != null;

  const onImgLoad = () => {
    const img = imgRef.current;
    if (!img || width) return;
    const initial = clamp(img.naturalWidth || 480, MIN_SIZE, MAX_WIDTH);
    updateAttributes({ width: initial, height: null });
  };

  const setAlign = (next: AlignValue) => {
    updateAttributes({ align: next });
    editor.view.focus();
  };

  const selectThis = useCallback(() => {
    const pos = typeof getPos === "function" ? getPos() : null;
    if (typeof pos === "number") {
      editor.chain().setNodeSelection(pos).run();
    }
  }, [editor, getPos]);

  const startResize = useCallback(
    (e: React.PointerEvent, handle: ResizeHandle) => {
      e.preventDefault();
      e.stopPropagation();
      selectThis();

      const startX = e.clientX;
      const startY = e.clientY;
      const box = imgRef.current?.getBoundingClientRect();
      const startW = width || box?.width || 320;
      const startH = height || box?.height || startW * 0.75;
      // 모서리: 현재 표시 비율(찌그러진 상태 포함) 유지
      const displayRatio = startW / Math.max(startH, 1);

      resizingRef.current = true;

      const onMove = (ev: PointerEvent) => {
        if (!resizingRef.current) return;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;

        // 좌/우: 높이 고정, 가로만
        if (handle === "e" || handle === "w") {
          const delta = handle === "e" ? dx : -dx;
          updateAttributes({
            width: clamp(startW + delta, MIN_SIZE, MAX_WIDTH),
            height: clamp(startH, MIN_SIZE, MAX_HEIGHT),
          });
          return;
        }

        // 위/아래: 가로 고정, 세로만
        if (handle === "n" || handle === "s") {
          const delta = handle === "s" ? dy : -dy;
          updateAttributes({
            width: clamp(startW, MIN_SIZE, MAX_WIDTH),
            height: clamp(startH + delta, MIN_SIZE, MAX_HEIGHT),
          });
          return;
        }

        // 모서리: 현재 표시 비율 유지 (닮음)
        const growX = handle === "se" || handle === "ne" ? dx : -dx;
        const growY = handle === "se" || handle === "sw" ? dy : -dy;
        const useX = Math.abs(growX) >= Math.abs(growY);
        let nextW: number;
        let nextH: number;
        if (useX) {
          nextW = clamp(startW + growX, MIN_SIZE, MAX_WIDTH);
          nextH = clamp(nextW / displayRatio, MIN_SIZE, MAX_HEIGHT);
          nextW = clamp(nextH * displayRatio, MIN_SIZE, MAX_WIDTH);
        } else {
          nextH = clamp(startH + growY, MIN_SIZE, MAX_HEIGHT);
          nextW = clamp(nextH * displayRatio, MIN_SIZE, MAX_WIDTH);
          nextH = clamp(nextW / displayRatio, MIN_SIZE, MAX_HEIGHT);
        }

        if (height == null) {
          // 아직 찌그러지지 않은 상태 → width만, height는 auto(원본 비율)
          updateAttributes({ width: nextW, height: null });
        } else {
          updateAttributes({ width: nextW, height: nextH });
        }
      };

      const onUp = () => {
        resizingRef.current = false;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        editor.view.focus();
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [editor, height, selectThis, updateAttributes, width]
  );

  useEffect(() => {
    return () => {
      resizingRef.current = false;
    };
  }, []);

  const figureStyle: React.CSSProperties = {};
  if (width) figureStyle.width = `${width}px`;
  if (height) figureStyle.height = `${height}px`;

  const imgStyle: React.CSSProperties = {
    width: "100%",
    display: "block",
    ...(distorted
      ? { height: "100%", objectFit: "fill" as const }
      : { height: "auto" }),
  };

  return (
    <NodeViewWrapper
      as="div"
      className={cn(
        "article-image-block",
        `align-${align}`,
        selected && "is-selected",
        dragging && "is-dragging",
        distorted && "is-distorted"
      )}
      data-drag-handle=""
      data-align={align}
      data-width={width ? String(width) : undefined}
      data-height={height ? String(height) : undefined}
      style={figureStyle}
    >
      <div className="article-image-inner" contentEditable={false}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          className="article-image-img"
          draggable={false}
          onLoad={onImgLoad}
          onClick={(e) => {
            e.preventDefault();
            selectThis();
          }}
          onPointerDown={() => setDragging(true)}
          onPointerUp={() => setDragging(false)}
          style={imgStyle}
        />

        {selected ? (
          <>
            <div
              className="article-image-bubble"
              contentEditable={false}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className={cn("article-image-bubble-btn", align === "left" && "active")}
                onClick={() => setAlign("left")}
                title="왼쪽 정렬"
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
                title="오른쪽 정렬"
                aria-label="오른쪽 정렬"
              >
                <AlignRight className="h-3.5 w-3.5" />
              </button>
            </div>
            {RESIZE_HANDLES.map((handle) => (
              <span
                key={handle}
                className={cn("article-image-resize", handle)}
                onPointerDown={(e) => startResize(e, handle)}
                aria-hidden
              />
            ))}
          </>
        ) : null}
      </div>
    </NodeViewWrapper>
  );
}
