import type { Metadata } from "next";
import type { DisclosureWithStock } from "@/lib/types";
import { getCoverImageUrl, previewSummaryFromBody } from "@/lib/manual-post";
import { disclosureStockLabel } from "@/lib/news-display";
import { getSiteUrl, SITE_NAME_KO } from "@/lib/site";

const META_DESCRIPTION_MAX = 160;

export function buildReportImageAlt(title: string): string {
  const trimmed = title.trim() || "리포트";
  return `${trimmed} 이미지`;
}

/** HTML 본문 내 빈 alt 이미지에 리포트 제목 기반 alt 자동 주입 */
export function ensureImageAltInHtml(html: string, alt: string): string {
  const safeAlt = alt.replace(/"/g, "&quot;");
  return html.replace(/<img\b([^>]*)>/gi, (_match, attrs: string) => {
    const altMatch = /\balt\s*=\s*["']([^"']*)["']/i.exec(attrs);
    if (altMatch?.[1]?.trim()) return `<img${attrs}>`;

    const cleaned = attrs.replace(/\balt\s*=\s*["'][^"']*["']/gi, "").trim();
    const prefix = cleaned ? ` ${cleaned}` : "";
    return `<img${prefix} alt="${safeAlt}">`;
  });
}

/** plain text 본문을 SEO 친화적 <p> 단락 HTML로 변환 */
export function plainTextToParagraphHtml(text: string): string {
  const blocks = text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length === 0) {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return "";
    return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
  }

  return blocks
    .map((block) => {
      const inner = block
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => escapeHtml(line))
        .join("<br>");
      return `<p>${inner}</p>`;
    })
    .join("");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildReportDescription(row: DisclosureWithStock): string {
  const fromSummary = row.summary
    ?.split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(" ");

  if (fromSummary) return truncateMetaDescription(fromSummary);

  const fromBody = previewSummaryFromBody(row.raw_content ?? "", META_DESCRIPTION_MAX);
  if (fromBody) return truncateMetaDescription(fromBody);

  const { name } = disclosureStockLabel(row);
  return `${row.title ?? "뉴스"} — ${name} · ${SITE_NAME_KO}`;
}

function truncateMetaDescription(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= META_DESCRIPTION_MAX) return normalized;
  return `${normalized.slice(0, META_DESCRIPTION_MAX - 1).trim()}…`;
}

export function buildNewsDetailMetadata(
  row: DisclosureWithStock,
  id: string
): Metadata {
  const title = row.title?.trim() || "뉴스";
  const description = buildReportDescription(row);
  const cover = getCoverImageUrl(row);
  const canonicalPath = `/news/${id}`;
  const { name } = disclosureStockLabel(row);

  return {
    title,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      type: "article",
      title: `${name} — ${title}`,
      description,
      url: canonicalPath,
      publishedTime: row.created_at,
      ...(cover ? { images: [{ url: cover, alt: buildReportImageAlt(title) }] } : {}),
    },
    twitter: {
      card: cover ? "summary_large_image" : "summary",
      title: `${name} — ${title}`,
      description,
      ...(cover ? { images: [cover] } : {}),
    },
  };
}

export function getCanonicalNewsUrl(id: string): string {
  return new URL(`/news/${id}`, getSiteUrl()).toString();
}
