/**
 * One live dump-index capture → Supabase. Used by GitHub Actions.
 *   npm run capture:washout
 */
import { resolve } from "node:path";
import { config } from "dotenv";
import { captureWashoutLive } from "../lib/us-market/washout-live";
import { polygonAdvancedKeyOrNull, polygonStarterKeyOrNull } from "../lib/us-market/polygon-keys";
import { washoutCaptureSkipReason } from "../lib/us-market/washout-schedule";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

async function main(): Promise<void> {
  if (!polygonAdvancedKeyOrNull() && !polygonStarterKeyOrNull()) {
    throw new Error("POLYGON_API_KEY_ADVANCED or POLYGON_API_KEY is missing");
  }
  const skip = await washoutCaptureSkipReason();
  if (skip !== "ok") {
    console.log(new Date().toISOString(), "skip", skip);
    return;
  }
  const live = await captureWashoutLive();
  console.log(
    new Date().toISOString(),
    `tape=${live.tapeYmd} index=${live.index.toFixed(2)} names=${live.items.length} pts=${live.series.length}`
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
