"use client";

import { useMemo } from "react";
import {
  computeOverlayContainerHeight,
  parseBodyToOverlayDocument,
  type OverlayArticleDocument,
} from "@/lib/canvas-document";

type OverlayArticleViewerProps = {
  rawContent: string;
};

export function OverlayArticleViewer({ rawContent }: OverlayArticleViewerProps) {
  const doc = useMemo(() => parseBodyToOverlayDocument(rawContent), [rawContent]);
  return <OverlayArticleStage doc={doc} />;
}

/** @deprecated OverlayArticleViewer 사용 */
export const CanvasArticleViewer = OverlayArticleViewer;

export function OverlayArticleStage({ doc }: { doc: OverlayArticleDocument }) {
  const height = computeOverlayContainerHeight(doc);

  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-[#f8f8fa] p-3">
      <div
        className="relative mx-auto rounded-lg bg-white shadow-sm"
        style={{ width: doc.canvasWidth, minHeight: height }}
        aria-label="본문"
      >
        <article
          className="article-rich-body relative z-0 px-4 py-4 text-sm leading-relaxed text-foreground/90"
          dangerouslySetInnerHTML={{ __html: doc.content }}
        />

        <div className="pointer-events-none absolute inset-0 z-10">
          {doc.overlay_images.map((img) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={img.id}
              src={img.src}
              alt=""
              className="absolute rounded-md border border-border/60 bg-white shadow-sm object-contain"
              style={{
                left: img.x,
                top: img.y,
                width: img.width,
                height: img.height,
                zIndex: img.zIndex,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
