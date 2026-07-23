/**
 * CLI entry for SEC disclosure crawl.
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY,
 * optional GEMINI_MODEL / SEC_USER_AGENT / CRAWL_MAX_ITEMS
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { runEdgarDisclosureCrawl } from "../lib/crawl/edgar-disclosure-crawl";

// Load local env when run outside GitHub Actions / Vercel.
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

runEdgarDisclosureCrawl()
  .then((r) => {
    console.log(r.message);
    process.exit(r.ok ? 0 : 1);
  })
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
