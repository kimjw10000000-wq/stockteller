"use client";

import { useMemo } from "react";
import {
  computeCanvasRenderHeight,
  parseCanvasDocument,
  type CanvasDocument,
} from "@/lib/canvas-document";

type CanvasArticleViewerProps = {
  rawContent: string;
};

export function CanvasArticleViewer({ rawContent }: CanvasArticleViewerProps) {
  const doc = useMemo(() => parseCanvasDocument(rawContent), [rawContent]);
  if (!doc) return null;

  return <CanvasStage doc={doc} readOnly />;
}

export function CanvasStage({
  doc,
  readOnly = true,
}: {
  doc: CanvasDocument;
  readOnly?: boolean;
}) {
  const height = computeCanvasRenderHeight(doc);

  return (
    <div className={`${readOnly ? "mt-3" : ""} overflow-x-auto rounded-lg border border-border bg-[#f8f8fa] p-3`}>
      <div
        className="relative mx-auto rounded-lg bg-white shadow-sm"
        style={{ width: doc.canvasWidth, height, minHeight: doc.canvasHeight }}
        aria-label="캔버스 본문"
      >
        {doc.elements.map((el) => (
          <div
            key={el.id}
            className="absolute overflow-hidden rounded-md border border-border/60 bg-white shadow-sm"
            style={{
              left: el.x,
              top: el.y,
              width: el.width,
              height: el.height,
              zIndex: el.zIndex,
            }}
          >
            {el.type === "text" ? (
              <div className="h-full w-full overflow-auto whitespace-pre-wrap p-3 text-sm leading-relaxed text-foreground/90">
                {el.content || ""}
              </div>
            ) : el.content ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={el.content} alt="" className="h-full w-full object-contain" />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
