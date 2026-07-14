"use client";

import { useMemo } from "react";
import { Rnd } from "react-rnd";
import {
  ARTICLE_CONTENT_MAX_WIDTH,
  blockMinHeightForImages,
  parseArticleBlocks,
} from "@/lib/overlay-article-layout";
import type { OverlayImage } from "@/lib/canvas-document";

type OverlayArticleBodyProps = {
  content: string;
  images: OverlayImage[];
  imageAlt?: string;
  maxWidth?: number;
  mode?: "view" | "edit";
  selectedImageId?: string | null;
  onSelectImage?: (id: string | null) => void;
  onImageChange?: (id: string, patch: Partial<OverlayImage>) => void;
  className?: string;
};

export function OverlayArticleBody({
  content,
  images,
  imageAlt = "",
  maxWidth = ARTICLE_CONTENT_MAX_WIDTH,
  mode = "view",
  selectedImageId = null,
  onSelectImage,
  onImageChange,
  className = "",
}: OverlayArticleBodyProps) {
  const blocks = useMemo(() => parseArticleBlocks(content), [content]);

  const imagesByBlock = useMemo(() => {
    const map = new Map<number, OverlayImage[]>();
    for (const img of images) {
      const idx = Math.max(0, img.paragraphIndex ?? 0);
      const list = map.get(idx) ?? [];
      list.push(img);
      map.set(idx, list);
    }
    return map;
  }, [images]);

  return (
    <div
      className={`mx-auto w-full ${className}`}
      style={{ maxWidth }}
      aria-label="본문"
    >
      {blocks.map((block) => {
        const blockImages = imagesByBlock.get(block.index) ?? [];
        const minHeight = blockMinHeightForImages(blockImages);

        return (
          <div
            key={block.index}
            className="relative article-block"
            data-paragraph-index={block.index}
            style={{ minHeight }}
          >
            <div
              className="article-rich-body text-sm leading-relaxed text-foreground/90"
              dangerouslySetInnerHTML={{ __html: block.html }}
            />

            {blockImages.map((img) =>
              mode === "edit" && onImageChange ? (
                <Rnd
                  key={img.id}
                  bounds="parent"
                  size={{ width: img.width, height: img.height }}
                  position={{ x: img.x, y: img.y }}
                  onDragStop={(_e, data) =>
                    onImageChange(img.id, { x: data.x, y: data.y })
                  }
                  onResizeStop={(_e, _dir, ref, _delta, position) =>
                    onImageChange(img.id, {
                      width: parseInt(ref.style.width, 10),
                      height: parseInt(ref.style.height, 10),
                      x: position.x,
                      y: position.y,
                    })
                  }
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    onSelectImage?.(img.id);
                  }}
                  className="z-20"
                  style={{ zIndex: img.zIndex }}
                  enableResizing
                >
                  <div
                    className={`h-full w-full overflow-hidden rounded-md border bg-white shadow-md ${
                      selectedImageId === img.id
                        ? "border-primary ring-2 ring-primary/40"
                        : "border-border/80"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.src}
                      alt={imageAlt}
                      className="h-full w-full object-contain"
                      draggable={false}
                    />
                  </div>
                </Rnd>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={img.id}
                  src={img.src}
                  alt={imageAlt}
                  className="absolute rounded-md border border-border/60 bg-white object-contain shadow-sm"
                  style={{
                    left: img.x,
                    top: img.y,
                    width: img.width,
                    height: img.height,
                    zIndex: img.zIndex,
                  }}
                />
              )
            )}
          </div>
        );
      })}
    </div>
  );
}
