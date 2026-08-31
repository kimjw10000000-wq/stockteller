/**
 * CLI: SEC 6-K + Exhibit 99.1 → Groq → wire_news (news / sec).
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GROQ_API_KEY
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { runEdgar6kCrawl } from "../lib/crawl/edgar-6k-crawl";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

runEdgar6kCrawl()
  .then((r) => {
    console.log(r.message);
    process.exit(r.ok ? 0 : 1);
  })
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
