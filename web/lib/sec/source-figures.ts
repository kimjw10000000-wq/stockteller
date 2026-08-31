/**
 * Closed-set figures from a press release: money scale, percent, share counts, split/merger ratios.
 * Source text is never mutated. Korean labels are applied only to the Groq summary.
 */

export type SourceFigure = {
  kind: "money" | "percent" | "ratio" | "shares";
  source: string;
  display: string;
};

type Hit = {
  start: number;
  end: number;
  figure: SourceFigure;
};

const SCALE: Record<string, number> = {
  thousand: 1_000,
  k: 1_000,
  million: 1_000_000,
  m: 1_000_000,
  mm: 1_000_000,
  mn: 1_000_000,
  billion: 1_000_000_000,
  bn: 1_000_000_000,
  trillion: 1_000_000_000_000,
  tn: 1_000_000_000_000,
};

const RATIO_NEAR =
  /\b(?:reverse\s+)?(?:stock\s+)?split\b|\bratio\b|\bconsolidat|\bmerger\b|\bexchange\b|\bcombination\b/i;

function parseNum(raw: string): number | null {
  const n = Number(String(raw).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function formatKoCount(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 100_000_000) {
    const eok = abs / 100_000_000;
    return `${sign}${formatKoDecimal(eok)}억`;
  }
  if (abs >= 10_000) {
    const man = abs / 10_000;
    return `${sign}${formatKoDecimal(man)}만`;
  }
  return `${sign}${formatKoDecimal(abs)}`;
}

function formatKoDecimal(n: number): string {
  if (Math.abs(n - Math.round(n)) < 1e-9) {
    return Math.round(n).toLocaleString("en-US");
  }
  return n.toLocaleString("en-US", { maximumFractionDigits: 4, minimumFractionDigits: 0 });
}

function scaleKey(raw: string): number | null {
  const k = raw.toLowerCase().replace(/\./g, "");
  return SCALE[k] ?? null;
}

function overlaps(hits: Hit[], start: number, end: number): boolean {
  return hits.some((h) => start < h.end && end > h.start);
}

function push(hits: Hit[], start: number, end: number, figure: SourceFigure) {
  if (start < 0 || end <= start) return;
  if (overlaps(hits, start, end)) return;
  hits.push({ start, end, figure });
}

function addRegex(
  hits: Hit[],
  text: string,
  re: RegExp,
  toFigure: (m: RegExpExecArray) => SourceFigure | null
) {
  const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  let m: RegExpExecArray | null;
  while ((m = r.exec(text)) !== null) {
    const fig = toFigure(m);
    if (!fig) continue;
    push(hits, m.index, m.index + m[0].length, fig);
  }
}

export function extractSourceFigures(text: string): SourceFigure[] {
  const hits: Hit[] = [];
  const src = text || "";

  addRegex(
    hits,
    src,
    /\b(\d+(?:\.\d+)?)\s*[-–/]\s*for\s*[-–]?\s*(\d+(?:\.\d+)?)\b/gi,
    (m) => ({
      kind: "ratio",
      source: m[0],
      display: `${m[1]}대 ${m[2]}(${m[0]})`,
    })
  );
  addRegex(
    hits,
    src,
    /\b(\d+(?:\.\d+)?)\s+for\s+(\d+(?:\.\d+)?)\b/gi,
    (m) => ({
      kind: "ratio",
      source: m[0],
      display: `${m[1]}대 ${m[2]}(${m[0]})`,
    })
  );
  addRegex(
    hits,
    src,
    /\b(\d+(?:\.\d+)?)\s*[-–]\s*to\s*[-–]?\s*(\d+(?:\.\d+)?)\b/gi,
    (m) => ({
      kind: "ratio",
      source: m[0],
      display: `${m[1]}대 ${m[2]}(${m[0]})`,
    })
  );
  addRegex(hits, src, /\b(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)\b/g, (m) => {
    const around = src.slice(Math.max(0, m.index - 48), m.index + m[0].length + 48);
    if (!RATIO_NEAR.test(around)) return null;
    return {
      kind: "ratio",
      source: m[0],
      display: `${m[1]}대 ${m[2]}(${m[0]})`,
    };
  });

  addRegex(
    hits,
    src,
    /\b([\d,]+(?:\.\d+)?)\s*(thousand|million|billion|trillion|mn|mm|bn)\s+(shares?|ads|warrants?)\b/gi,
    (m) => {
      const n = parseNum(m[1]);
      const mul = scaleKey(m[2]);
      if (n == null || mul == null) return null;
      const unit = /share/i.test(m[3]) ? "주" : m[3];
      return {
        kind: "shares",
        source: m[0],
        display: `${formatKoCount(n * mul)}${unit}(${m[0]})`,
      };
    }
  );

  addRegex(
    hits,
    src,
    /(?:\$|USD\s*)\s*([\d,]+(?:\.\d+)?)\s*(thousand|million|billion|trillion|mn|mm|bn|k)\b/gi,
    (m) => {
      const n = parseNum(m[1]);
      const mul = scaleKey(m[2]);
      if (n == null || mul == null) return null;
      return {
        kind: "money",
        source: m[0],
        display: `${formatKoCount(n * mul)} 달러(${m[0].trim()})`,
      };
    }
  );
  addRegex(
    hits,
    src,
    /\b([\d,]+(?:\.\d+)?)\s*(thousand|million|billion|trillion)\s+(?:U\.?S\.?\s*)?(?:dollars?|USD)\b/gi,
    (m) => {
      const n = parseNum(m[1]);
      const mul = scaleKey(m[2]);
      if (n == null || mul == null) return null;
      return {
        kind: "money",
        source: m[0],
        display: `${formatKoCount(n * mul)} 달러(${m[0]})`,
      };
    }
  );

  addRegex(hits, src, /(?:\$|USD\s*)\s*([\d,]+(?:\.\d+)?)\b/g, (m) => {
    const n = parseNum(m[1]);
    if (n == null) return null;
    const display =
      n >= 10_000 ? `${formatKoCount(n)} 달러(${m[0].trim()})` : `${m[0].trim()}`;
    return { kind: "money", source: m[0], display };
  });

  addRegex(hits, src, /\b(\d+(?:\.\d+)?)\s*(?:%|percent)\b/gi, (m) => ({
    kind: "percent",
    source: m[0],
    display: `${m[1]}%`,
  }));

  hits.sort((a, b) => a.start - b.start);
  const seen = new Set<string>();
  const out: SourceFigure[] = [];
  for (const h of hits) {
    const key = h.figure.source;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h.figure);
  }
  return out;
}

export function figuresPromptBlock(figures: SourceFigure[]): string {
  if (!figures.length) return "";
  const lines = figures.slice(0, 40).map((f) => `- ${f.source}`);
  return [
    "[원문 숫자] Copy these strings EXACTLY into the Korean title and summary. Do not convert million/billion into 만/억. Do not rewrite split ratios.",
    ...lines,
  ].join("\n");
}

/** Replace copied English figures in the model output. Does not touch the filing source. */
export function applyFigureGlossary(text: string, figures: SourceFigure[]): string {
  if (!text) return text;
  const ordered = [...figures].sort((a, b) => b.source.length - a.source.length);
  let out = text;
  for (const f of ordered) {
    if (!f.source) continue;
    out = out.split(f.source).join(f.display);
  }
  return out;
}

const MAN_RE = /[\d,]+(?:\.\d+)?만/g;

export function inventedManAmounts(text: string, figures: SourceFigure[]): string[] {
  const allowed = new Set<string>();
  for (const f of figures) {
    const parts = f.display.match(/[\d,]+(?:\.\d+)?만/g) ?? [];
    for (const p of parts) allowed.add(p);
  }
  const found = text.match(MAN_RE) ?? [];
  return [...new Set(found.filter((m) => !allowed.has(m)))];
}
