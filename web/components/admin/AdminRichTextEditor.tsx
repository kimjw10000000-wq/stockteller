"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Underline as UnderlineIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { normalizeEditorContent } from "@/lib/html-utils";
import { cn } from "@/lib/utils";

type AdminRichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  editorKey?: string;
  /** 오버레이 에디터용: 인라인 이미지·붙여넣기 비활성화 */
  textOnly?: boolean;
  /** 캔버스 내부 임베드: 외곽 테두리·배경 제거 */
  embedded?: boolean;
};

async function uploadEditorImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.set("image", file);
  const res = await fetch("/api/admin/upload-image", { method: "POST", body: formData });
  const j = (await res.json()) as { ok?: boolean; url?: string; error?: string };
  if (!res.ok || !j.ok || !j.url) {
    throw new Error(j.error ?? "이미지 업로드에 실패했습니다.");
  }
  return j.url;
}

export function AdminRichTextEditor({
  value,
  onChange,
  placeholder,
  editorKey,
  textOnly = false,
  embedded = false,
}: AdminRichTextEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadingRef = useRef(false);
  const editorRef = useRef<Editor | null>(null);

  const resolvedPlaceholder =
    placeholder ??
    (textOnly
      ? "여기에 본문을 자유롭게 작성하세요."
      : "기사 본문을 작성하세요. 이미지는 드래그·붙여넣기(Ctrl+V) 또는 툴바로 삽입할 수 있습니다.");

  const insertImageFromFile = useCallback(async (file: File) => {
    const ed = editorRef.current;
    if (!ed || uploadingRef.current) return;
    uploadingRef.current = true;
    try {
      const url = await uploadEditorImage(file);
      ed.chain().focus().setImage({ src: url, alt: "" }).run();
    } catch (err) {
      console.error("[rich-editor] image upload failed", err);
      window.alert(err instanceof Error ? err.message : "이미지 업로드에 실패했습니다.");
    } finally {
      uploadingRef.current = false;
    }
  }, []);

  const extensions = useMemo(() => {
    const imageExt = Image.configure({
      inline: false,
      allowBase64: false,
      HTMLAttributes: { class: "editor-inline-image" },
    });
    return textOnly
      ? [
          StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
          Underline,
          Placeholder.configure({ placeholder: resolvedPlaceholder }),
        ]
      : [
          StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
          Underline,
          imageExt,
          Placeholder.configure({ placeholder: resolvedPlaceholder }),
        ];
  }, [resolvedPlaceholder, textOnly]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: normalizeEditorContent(value),
    editorProps: {
      attributes: {
        class: "admin-rich-editor-content focus:outline-none",
      },
      handleDrop: textOnly
        ? undefined
        : (_view, event) => {
            const file = event.dataTransfer?.files?.[0];
            if (file?.type.startsWith("image/")) {
              event.preventDefault();
              void insertImageFromFile(file);
              return true;
            }
            return false;
          },
      handlePaste: textOnly
        ? undefined
        : (_view, event) => {
            const items = event.clipboardData?.items;
            if (!items) return false;
            for (let i = 0; i < items.length; i += 1) {
              const item = items[i];
              if (item.type.startsWith("image/")) {
                event.preventDefault();
                const file = item.getAsFile();
                if (file) void insertImageFromFile(file);
                return true;
              }
            }
            return false;
          },
    },
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getHTML());
    },
  });

  editorRef.current = editor ?? null;

  useEffect(() => {
    if (!editor) return;
    const normalized = normalizeEditorContent(value);
    const current = editor.getHTML();
    if (normalized !== current) {
      editor.commands.setContent(normalized, { emitUpdate: false });
    }
  }, [editor, value, editorKey]);

  const onImageButtonClick = () => {
    fileInputRef.current?.click();
  };

  const onImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void insertImageFromFile(file);
    e.target.value = "";
  };

  if (!editor) {
    return (
      <div
        className={cn(
          "p-4 text-sm text-muted-foreground",
          embedded ? "" : "rounded-lg border border-border bg-input-background"
        )}
      >
        에디터를 불러오는 중…
      </div>
    );
  }

  return (
    <div
      className={cn(
        embedded ? "" : "overflow-hidden rounded-lg border border-border bg-input-background"
      )}
    >
      <div
        className={cn(
          "flex flex-wrap items-center gap-1 border-b border-border bg-muted/30 p-2",
          embedded && "rounded-t-lg"
        )}
      >
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          label="굵게"
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          label="기울임"
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive("underline")}
          label="밑줄"
        >
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          active={editor.isActive("heading", { level: 1 })}
          label="제목 1"
        >
          <Heading1 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive("heading", { level: 2 })}
          label="제목 2"
        >
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive("heading", { level: 3 })}
          label="제목 3"
        >
          <Heading3 className="h-4 w-4" />
        </ToolbarButton>
        {!textOnly ? (
          <>
            <span className="mx-1 h-5 w-px bg-border" aria-hidden />
            <ToolbarButton onClick={onImageButtonClick} label="이미지 삽입">
              <ImagePlus className="h-4 w-4" />
            </ToolbarButton>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={onImageFileChange}
            />
          </>
        ) : null}
      </div>
      <EditorContent
        editor={editor}
        className={cn(
          "admin-rich-editor px-3 py-3 text-sm text-foreground",
          embedded ? "min-h-[420px]" : "min-h-[320px]"
        )}
      />
    </div>
  );
}

type ToolbarButtonProps = {
  onClick: () => void;
  active?: boolean;
  label: string;
  children: React.ReactNode;
};

function ToolbarButton({ onClick, active, label, children }: ToolbarButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("h-8 w-8", active && "bg-accent text-accent-foreground")}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {children}
    </Button>
  );
}
