"use client";

import { useMemo } from "react";
import {
  computeOverlayContainerHeight,
  parseBodyToOverlayDocument,
  type OverlayArticleDocument,
} from "@/lib/canvas-document";
import { buildReportImageAlt, prepareArticleBodyHtml } from "@/lib/seo";

type OverlayArticleViewerProps = {
  rawContent: string;
  reportTitle?: string;
};

export function OverlayArticleViewer({ rawContent, reportTitle }: OverlayArticleViewerProps) {
  const doc = useMemo(() => parseBodyToOverlayDocument(rawContent), [rawContent]);
  const imageAlt = buildReportImageAlt(reportTitle ?? "리포트");
  const contentHtml = useMemo(
    () => prepareArticleBodyHtml(doc.content, imageAlt),
    [doc.content, imageAlt]
  );
  return <OverlayArticleStage doc={doc} contentHtml={contentHtml} imageAlt={imageAlt} />;
}

/** @deprecated OverlayArticleViewer 사용 */
export const CanvasArticleViewer = OverlayArticleViewer;

export function OverlayArticleStage({
  doc,
  contentHtml,
  imageAlt,
}: {
  doc: OverlayArticleDocument;
  contentHtml: string;
  imageAlt: string;
}) {
  const height = computeOverlayContainerHeight(doc);

  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-[#f8f8fa] p-3">
      <div
        className="relative mx-auto rounded-lg bg-white shadow-sm"
        style={{ width: doc.canvasWidth, minHeight: height }}
        aria-label="본문"
      >
        <div
          className="article-rich-body relative z-0 px-4 py-4 text-sm leading-relaxed text-foreground/90"
          dangerouslySetInnerHTML={{ __html: contentHtml }}
        />

        <div className="pointer-events-none absolute inset-0 z-10">
          {doc.overlay_images.map((img) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={img.id}
              src={img.src}
              alt={imageAlt}
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
