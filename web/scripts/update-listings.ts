/**
 * Nasdaq/NYSE/AMEX file vs DB — same job as the old admin Update button.
 * Runs on this machine until finished (no Vercel time limit).
 *
 *   npm run listings:update
 */
import { config } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "../lib/supabase/admin";
import {
  diffListings,
  inheritPendingJuniors,
  saveListingSnapshot,
  scanListingUpdate,
} from "../lib/companies/listing-admin";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

async function main() {
  const admin = createAdminClient();
  if (process.argv.includes("--snap-only")) {
    const inherited = await inheritPendingJuniors(admin);
    const diff = await diffListings(admin);
    await saveListingSnapshot(admin, {
      ...diff,
      matched: 0,
      prunedAliases: [],
      inheritedJuniors: inherited,
      moreWork: false,
    });
    console.log(
      `[listings:update] snapshot only inherited=${inherited} listA=${diff.listA.length} listB=${diff.listB.length} paired=${diff.pairedJuniors.length}`
    );
    console.log(diff.listA.map((r) => r.ticker).join(", "));
    return;
  }
  let round = 0;
  let inheritedTotal = 0;
  for (;;) {
    round += 1;
    console.log(`[listings:update] round ${round} …`);
    const result = await scanListingUpdate(admin);
    inheritedTotal += result.inheritedJuniors;
    console.log(
      `[listings:update] matched=${result.matched} inherited=${result.inheritedJuniors} listA=${result.listA.length} listB=${result.listB.length} paired=${result.pairedJuniors.length} more=${result.moreWork}`
    );
    if (!result.moreWork) {
      console.log("[listings:update] done");
      console.log(
        JSON.stringify(
          {
            traderCount: result.traderCount,
            matched: result.matched,
            inheritedJuniors: inheritedTotal,
            prunedAliases: result.prunedAliases,
            listA: result.listA.map((r) => `${r.ticker} ${r.exchange} ${r.name}`),
            pairedJuniors: result.pairedJuniors.map((r) => `${r.ticker} <- ${r.parentTicker}`),
            listBCount: result.listB.length,
            aliases: result.aliases,
          },
          null,
          2
        )
      );
      await saveListingSnapshot(admin, {
        ...result,
        inheritedJuniors: inheritedTotal,
      });
      console.log("[listings:update] snapshot saved");
      return;
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
