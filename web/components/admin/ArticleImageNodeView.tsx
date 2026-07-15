"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";
import { cn } from "@/lib/utils";

const MIN_WIDTH = 80;
const MAX_WIDTH = 768;

type AlignValue = "left" | "center" | "right";
type ResizeHandle = "nw" | "ne" | "sw" | "se" | "e" | "w";

const RESIZE_HANDLES: ResizeHandle[] = ["nw", "ne", "sw", "se", "e", "w"];

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
  const width = node.attrs.width ? Number(node.attrs.width) : null;

  const onImgLoad = () => {
    const img = imgRef.current;
    if (!img || width) return;
    const initial = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, img.naturalWidth || 480));
    updateAttributes({ width: initial });
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
      const box = imgRef.current?.getBoundingClientRect();
      const startWidth = width || box?.width || 320;
      resizingRef.current = true;

      const growRight = handle === "se" || handle === "ne" || handle === "e";
      const growLeft = handle === "sw" || handle === "nw" || handle === "w";

      const onMove = (ev: PointerEvent) => {
        if (!resizingRef.current) return;
        let delta = 0;
        if (growRight) delta = ev.clientX - startX;
        else if (growLeft) delta = startX - ev.clientX;
        const next = Math.round(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + delta)));
        updateAttributes({ width: next });
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
    [editor, selectThis, updateAttributes, width]
  );

  useEffect(() => {
    return () => {
      resizingRef.current = false;
    };
  }, []);

  return (
    <NodeViewWrapper
      as="figure"
      className={cn(
        "article-image-block",
        `align-${align}`,
        selected && "is-selected",
        dragging && "is-dragging"
      )}
      data-drag-handle=""
      data-align={align}
      data-width={width ? String(width) : undefined}
      style={width ? { width: `${width}px` } : undefined}
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
          onPointerDown={() => setDragging(false)}
          style={{ width: "100%", height: "auto", display: "block" }}
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
