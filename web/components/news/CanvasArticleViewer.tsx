"use client";

import { useMemo } from "react";
import { parseBodyToOverlayDocument } from "@/lib/canvas-document";
import { OverlayArticleBody } from "@/components/article/OverlayArticleBody";
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

  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-[#f8f8fa] p-3">
      <div className="mx-auto rounded-lg bg-white px-3 py-3 shadow-sm">
        <OverlayArticleBody
          content={contentHtml}
          images={doc.overlay_images}
          imageAlt={imageAlt}
          maxWidth={doc.contentMaxWidth}
          mode="view"
        />
      </div>
    </div>
  );
}

/** @deprecated OverlayArticleViewer 사용 */
export const CanvasArticleViewer = OverlayArticleViewer;
