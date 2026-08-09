import { config } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "../lib/supabase/admin";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

async function main() {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("us_listed_companies")
    .select("*", { count: "exact", head: true });

  if (error) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          table: "us_listed_companies",
          count: 0,
          error: error.message,
          hint: "Run web/supabase/migrations/20260809_us_listed_companies.sql (+ newswire) in Supabase SQL Editor, then npm run sync:us-listed",
        },
        null,
        2
      )
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    JSON.stringify(
      { ok: true, table: "us_listed_companies", count: count ?? 0 },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
