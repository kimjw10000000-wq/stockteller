"use client";

import type { DragEvent, MouseEvent, ReactNode } from "react";
import { CONTENT_PROTECTION_ENABLED } from "@/lib/security/content-protection";
import { cn } from "@/lib/utils";

type ProtectedContentProps = {
  children: ReactNode;
  className?: string;
  /** false면 select-none만 두고 우클릭은 허용 (목록 카드의 '새 탭에서 열기') */
  blockContextMenu?: boolean;
  enabled?: boolean;
};

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("a, button, input, textarea, select, [contenteditable='true']"));
}

export function ProtectedContent({
  children,
  className,
  blockContextMenu = true,
  enabled = CONTENT_PROTECTION_ENABLED,
}: ProtectedContentProps) {
  function onContextMenu(e: MouseEvent) {
    if (!enabled || !blockContextMenu) return;
    if (isInteractiveTarget(e.target)) return;
    e.preventDefault();
  }

  function onDragStart(e: DragEvent) {
    if (!enabled) return;
    if (isInteractiveTarget(e.target)) return;
    e.preventDefault();
  }

  return (
    <div
      className={cn(
        enabled && "select-none [&_input]:select-text [&_textarea]:select-text",
        className
      )}
      onContextMenu={onContextMenu}
      onDragStart={onDragStart}
    >
      {children}
    </div>
  );
}
