/**
 * 글로벌 실시간 시세 감지 엔진 실행
 *
 * 사용 전: web/.env.local 에 키 설정 + supabase/high_volatility_stocks.sql 적용
 * 실행: cd web && npm run engine
 */

import { config } from "dotenv";
import { resolve } from "path";
import { startGlobalMarketEngine } from "../lib/market-engine/engine";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const engine = startGlobalMarketEngine();

function shutdown() {
  console.log("[engine] shutting down");
  engine.stop();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
