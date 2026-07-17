"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { EditorContent, ReactNodeViewRenderer, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import { TableKit } from "@tiptap/extension-table";
import Superscript from "@tiptap/extension-superscript";
import Subscript from "@tiptap/extension-subscript";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Underline as UnderlineIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ArticleImageNodeView } from "@/components/admin/ArticleImageNodeView";
import { normalizeEditorContent } from "@/lib/html-utils";
import { cn } from "@/lib/utils";
import {
  convertMathNotationInPlainText,
  extractClipboardImageFile,
  normalizePastedHtml,
} from "@/lib/article-body";

function parsePx(value: string | null | undefined): number | null {
  if (!value) return null;
  const n = Number(String(value).replace(/px$/i, "").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

const ArticleImage = Image.extend({
  name: "image",
  group: "block",
  draggable: true,
  selectable: true,
  atom: true,

  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => {
          const el = element as HTMLElement;
          return (
            parsePx(el.style.width) ??
            parsePx(el.getAttribute("width")) ??
            parsePx(el.getAttribute("data-width")) ??
            parsePx(el.closest("[data-width]")?.getAttribute("data-width"))
          );
        },
        renderHTML: (attributes) =>
          attributes.width ? { "data-width": String(attributes.width) } : {},
      },
      height: {
        default: null,
        parseHTML: (element) => {
          const el = element as HTMLElement;
          const styleH = el.style.height;
          if (!styleH || styleH === "auto") {
            return (
              parsePx(el.getAttribute("data-height")) ??
              parsePx(el.closest("[data-height]")?.getAttribute("data-height"))
            );
          }
          return (
            parsePx(styleH) ??
            parsePx(el.getAttribute("height")) ??
            parsePx(el.getAttribute("data-height"))
          );
        },
        renderHTML: (attributes) =>
          attributes.height ? { "data-height": String(attributes.height) } : {},
      },
      align: {
        default: "center",
        parseHTML: (element) => {
          const el = element as HTMLElement;
          return (
            el.getAttribute("data-align") ??
            el.closest("[data-align]")?.getAttribute("data-align") ??
            (el.classList.contains("align-left")
              ? "left"
              : el.classList.contains("align-right")
                ? "right"
                : "center")
          );
        },
        renderHTML: (attributes) => {
          const align = attributes.align ?? "center";
          return {
            "data-align": align,
            class: `editor-inline-image align-${align}`,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      { tag: "img[src]" },
      {
        tag: "div.article-image-block",
        getAttrs: (node) => {
          const el = node as HTMLElement;
          const img = el.querySelector("img");
          if (!img?.getAttribute("src")) return false;
          return {
            src: img.getAttribute("src"),
            alt: img.getAttribute("alt") ?? "",
            align: el.getAttribute("data-align") ?? "center",
            width:
              parsePx(el.getAttribute("data-width")) ??
              parsePx(el.style.width) ??
              parsePx(img.getAttribute("width")) ??
              parsePx(img.style.width),
            height:
              parsePx(el.getAttribute("data-height")) ??
              parsePx(el.style.height) ??
              parsePx(img.style.height) ??
              parsePx(img.getAttribute("height")),
          };
        },
      },
      {
        tag: "figure.article-image-block",
        getAttrs: (node) => {
          const el = node as HTMLElement;
          const img = el.querySelector("img");
          if (!img?.getAttribute("src")) return false;
          return {
            src: img.getAttribute("src"),
            alt: img.getAttribute("alt") ?? "",
            align: el.getAttribute("data-align") ?? "center",
            width:
              parsePx(el.getAttribute("data-width")) ??
              parsePx(el.style.width) ??
              parsePx(img.getAttribute("width")) ??
              parsePx(img.style.width),
            height:
              parsePx(el.getAttribute("data-height")) ??
              parsePx(el.style.height) ??
              parsePx(img.style.height) ??
              parsePx(img.getAttribute("height")),
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const align = (HTMLAttributes["data-align"] as string) || "center";
    const width =
      parsePx(HTMLAttributes["data-width"] as string) ??
      (HTMLAttributes.width ? Number(HTMLAttributes.width) : null);
    const height =
      parsePx(HTMLAttributes["data-height"] as string) ??
      (HTMLAttributes.height ? Number(HTMLAttributes.height) : null);

    const styleParts: string[] = [];
    if (width) styleParts.push(`width: ${width}px`);
    if (height) {
      styleParts.push(`height: ${height}px`);
      styleParts.push("object-fit: fill");
    } else if (width) {
      styleParts.push("height: auto");
    }

    const imgAttrs: Record<string, string | number> = {
      src: HTMLAttributes.src as string,
      alt: (HTMLAttributes.alt as string) ?? "",
      "data-align": align,
      class: `editor-inline-image align-${align}`,
    };
    if (width) {
      imgAttrs.width = width;
      imgAttrs["data-width"] = width;
    }
    if (height) {
      imgAttrs.height = height;
      imgAttrs["data-height"] = height;
    }
    if (styleParts.length) imgAttrs.style = styleParts.join("; ");

    return ["img", imgAttrs];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ArticleImageNodeView);
  },
});

type AdminRichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  editorKey?: string;
  isLoading?: boolean;
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
  placeholder = "워드처럼 작성하세요. 이미지를 클릭해 크기를 조절하고, 꾹 끌어 문단 사이로 옮길 수 있습니다.",
  editorKey,
  isLoading = false,
}: AdminRichTextEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadingRef = useRef(false);
  const editorRef = useRef<Editor | null>(null);

  const insertImageFromFile = useCallback(async (file: File) => {
    const ed = editorRef.current;
    if (!ed || uploadingRef.current) return;
    uploadingRef.current = true;
    try {
      const url = await uploadEditorImage(file);
      ed.chain()
        .focus()
        .setImage({ src: url, alt: "" })
        .updateAttributes("image", { align: "center" })
        .run();
    } catch (err) {
      console.error("[rich-editor] image upload failed", err);
      window.alert(err instanceof Error ? err.message : "이미지 업로드에 실패했습니다.");
    } finally {
      uploadingRef.current = false;
    }
  }, []);

  const extensions = useMemo(
    () => [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      Superscript,
      Subscript,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TableKit.configure({
        table: {
          resizable: false,
          HTMLAttributes: { class: "article-table" },
        },
      }),
      ArticleImage.configure({
        inline: false,
        allowBase64: false,
        HTMLAttributes: { class: "editor-inline-image align-center" },
      }),
      Placeholder.configure({ placeholder }),
    ],
    [placeholder]
  );

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    extensions,
    content: normalizeEditorContent(value),
    editorProps: {
      attributes: {
        class: "admin-rich-editor-content focus:outline-none max-w-3xl mx-auto",
      },
      transformPastedHTML: (html) => normalizePastedHtml(html),
      transformPastedText: (text) => convertMathNotationInPlainText(text),
      handleDrop: (_view, event, _slice, moved) => {
        // 에디터 내부 블록(이미지) 이동은 ProseMirror 기본 DnD에 맡김
        if (moved) return false;
        const file = event.dataTransfer?.files?.[0];
        if (file?.type.startsWith("image/")) {
          event.preventDefault();
          void insertImageFromFile(file);
          return true;
        }
        return false;
      },
      handlePaste: (view, event) => {
        const imageFile = extractClipboardImageFile(event.clipboardData);
        if (imageFile) {
          event.preventDefault();
          void insertImageFromFile(imageFile);
          return true;
        }

        const html = event.clipboardData?.getData("text/html")?.trim() ?? "";
        if (html) {
          event.preventDefault();
          view.pasteHTML(normalizePastedHtml(html));
          return true;
        }

        const plain = event.clipboardData?.getData("text/plain") ?? "";
        if (plain) {
          const converted = convertMathNotationInPlainText(plain);
          if (converted !== plain && /<\/?su[bp]>/i.test(converted)) {
            event.preventDefault();
            const asHtml = converted
              .split(/\n+/)
              .filter((line) => line.length > 0)
              .map((line) => `<p>${line}</p>`)
              .join("");
            view.pasteHTML(asHtml || `<p>${converted}</p>`);
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

  const onImageButtonClick = () => fileInputRef.current?.click();

  const onImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void insertImageFromFile(file);
    e.target.value = "";
  };

  const setImageAlign = (align: "left" | "center" | "right") => {
    editor?.chain().focus().updateAttributes("image", { align }).run();
  };

  const resizeImage = (delta: number) => {
    if (!editor?.isActive("image")) return;
    const attrs = editor.getAttributes("image");
    const current = Number(attrs.width) || 480;
    const next = Math.max(120, Math.min(768, current + delta));
    editor.chain().focus().updateAttributes("image", { width: next }).run();
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-border bg-muted/20 text-sm text-muted-foreground">
        기존 데이터를 불러오는 중입니다…
      </div>
    );
  }

  if (!editor) {
    return (
      <div className="rounded-lg border border-border bg-input-background p-4 text-sm text-muted-foreground">
        에디터를 불러오는 중…
      </div>
    );
  }

  const imageActive = editor.isActive("image");
  const currentAlign = (editor.getAttributes("image").align as string) || "center";

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-input-background">
      <div className="flex flex-wrap items-center gap-1 border-b border-border bg-muted/30 p-2">
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} label="굵게">
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} label="기울임">
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} label="밑줄">
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })} label="제목 1">
          <Heading1 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} label="제목 2">
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })} label="제목 3">
          <Heading3 className="h-4 w-4" />
        </ToolbarButton>
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
        {imageActive ? (
          <>
            <span className="mx-1 h-5 w-px bg-border" aria-hidden />
            <ToolbarButton onClick={() => setImageAlign("left")} active={currentAlign === "left"} label="왼쪽 정렬 (글 감싸기)">
              <AlignLeft className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton onClick={() => setImageAlign("center")} active={currentAlign === "center"} label="가운데 정렬">
              <AlignCenter className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton onClick={() => setImageAlign("right")} active={currentAlign === "right"} label="오른쪽 정렬 (글 감싸기)">
              <AlignRight className="h-4 w-4" />
            </ToolbarButton>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => resizeImage(-40)}
            >
              −
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => resizeImage(40)}
            >
              +
            </Button>
          </>
        ) : null}
      </div>
      <p className="border-b border-border bg-muted/10 px-3 py-1.5 text-xs text-muted-foreground">
        이미지 클릭 → 8방향 핸들(모서리=비율 유지, 상하좌우=자유 변형) · 꾹 끌어 문단 이동
      </p>
      <EditorContent
        editor={editor}
        className="admin-rich-editor h-[500px] max-h-[500px] overflow-y-auto px-3 py-3 text-sm text-foreground"
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
      onMouseDown={(e) => {
        // 툴바 클릭으로 에디터 포커스/선택이 풀리지 않도록 함
        e.preventDefault();
      }}
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
      aria-label={label}
      title={label}
    >
      {children}
    </Button>
  );
}
