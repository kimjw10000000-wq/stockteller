/**
 * Classify original press-release / 8-K text in scripts/dilution-samples/
 *   npx tsx scripts/test-together.ts
 *
 * Put one .txt per article. First line = title, rest = body.
 */
import { config } from "dotenv";
import { readdir, readFile } from "fs/promises";
import { join, resolve } from "path";
import { isTogetherConfigured, togetherModel } from "../lib/together/client";
import { classifyDilutionArticle } from "../lib/together/dilution";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const SAMPLE_DIR = resolve(process.cwd(), "scripts/dilution-samples");
const PASTE_FILE = resolve(process.cwd(), "paste-dilution.txt");

function parseArticle(raw: string, id: string): { id: string; title: string; body: string } | null {
  const text = raw.replace(/^\uFEFF/, "").trim();
  if (!text) return null;
  const placeholder = text.includes("이 줄부터 원문 전체를 붙여넣으세요");
  if (placeholder) return null;
  const nl = text.indexOf("\n");
  const title = (nl === -1 ? text : text.slice(0, nl)).trim();
  const body = (nl === -1 ? text : text.slice(nl + 1)).trim() || text;
  return { id, title, body };
}

async function loadSamples(): Promise<Array<{ id: string; title: string; body: string }>> {
  const out: Array<{ id: string; title: string; body: string }> = [];
  try {
    const paste = parseArticle(await readFile(PASTE_FILE, "utf8"), "dilution-paste.txt");
    if (paste) out.push(paste);
  } catch {
    // optional
  }
  try {
    const names = (await readdir(SAMPLE_DIR)).filter((n) => n.toLowerCase().endsWith(".txt"));
    for (const name of names) {
      const parsed = parseArticle(await readFile(join(SAMPLE_DIR, name), "utf8"), name);
      if (parsed) out.push(parsed);
    }
  } catch {
    // optional
  }
  return out;
}

async function main() {
  console.log(
    JSON.stringify({
      configured: isTogetherConfigured(),
      model: togetherModel(),
      sampleDir: SAMPLE_DIR,
      pasteFile: PASTE_FILE,
    })
  );
  if (!isTogetherConfigured()) {
    console.error("TOGETHER_API_KEY missing in web/.env.local");
    process.exit(1);
  }

  const samples = await loadSamples();
  if (samples.length === 0) {
    console.error("Paste the original into web/paste-dilution.txt (first line title, rest body).");
    process.exit(1);
  }

  for (const sample of samples) {
    const result = await classifyDilutionArticle({ title: sample.title, body: sample.body });
    console.log(
      JSON.stringify({
        file: sample.id,
        title: sample.title.slice(0, 120),
        dilution: result.dilution,
        type: result.type,
        summary: result.summary,
      })
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
