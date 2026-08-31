/**
 * EDGAR filing index.json helpers — document list, Exhibit 99.1, archive URLs.
 */

import { accessionToFolder, secFetch, stripHtml } from "@/lib/sec/edgar-client";

export function archiveFolderUrl(cikNumeric: number, accession: string): string {
  return `https://www.sec.gov/Archives/edgar/data/${cikNumeric}/${accessionToFolder(accession)}`;
}

export function archiveFileUrl(cikNumeric: number, accession: string, name: string): string {
  return `${archiveFolderUrl(cikNumeric, accession)}/${name}`;
}

export function archiveIndexUrl(cikNumeric: number, accession: string): string {
  return `${archiveFolderUrl(cikNumeric, accession)}/${accession}-index.html`;
}

export function isExhibit99_1Name(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    /ex[-_.]?99\.?1/i.test(lower) ||
    /exhibit[-_.]?99\.?1/i.test(lower) ||
    (/99\.1/.test(lower) && /\.(htm|html|txt)$/i.test(lower))
  );
}

export function pickExhibit99_1Names(names: string[]): string[] {
  return names.filter((n) => isExhibit99_1Name(n) && /\.(htm|html|txt)$/i.test(n));
}

/** Cover / primary 6-K (not exhibits, not images). */
export function pickPrimaryDocumentName(names: string[], exhibitNames: string[]): string | null {
  const exhibit = new Set(exhibitNames.map((n) => n.toLowerCase()));
  const docs = names.filter((n) => {
    const lower = n.toLowerCase();
    if (!/\.(htm|html|txt)$/i.test(lower)) return false;
    if (exhibit.has(lower)) return false;
    if (isExhibit99_1Name(n)) return false;
    if (/^ex[-_.]?\d/i.test(lower)) return false;
    if (/graphic|image|exhibit/i.test(lower) && !/6[\s._-]?k/i.test(lower)) return false;
    return true;
  });
  const sixk = docs.find((n) => /6[\s._-]?k/i.test(n));
  return sixk || docs[0] || null;
}

export async function listFilingDocumentNames(
  cikNumeric: number,
  accession: string
): Promise<string[]> {
  const url = `${archiveFolderUrl(cikNumeric, accession)}/index.json`;
  try {
    const res = await secFetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      directory?: { item?: Array<{ name?: string }> | { name?: string } };
    };
    const raw = data.directory?.item;
    const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return items.map((it) => String(it.name ?? "")).filter(Boolean);
  } catch {
    return [];
  }
}

export async function fetchFilingPlainText(url: string): Promise<string | null> {
  const res = await secFetch(url);
  if (!res.ok) return null;
  const html = await res.text();
  const text = stripHtml(html);
  return text || null;
}
