import { startFinnhubUsEngine } from "./finnhub-us";
import { startKisKrStream } from "./kis-kr";
import { startJQuantsPollLoop } from "./jquants-jp";

function parseList(envVal: string | undefined): string[] {
  if (!envVal?.trim()) return [];
  return envVal
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parsePrevCloseJson(raw: string | undefined): Record<string, number> {
  if (!raw?.trim()) return {};
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(j)) {
      const code = k.replace(/\D/g, "");
      const n = typeof v === "number" ? v : parseFloat(String(v));
      if (code.length >= 4 && Number.isFinite(n) && n > 0) out[code] = n;
    }
    return out;
  } catch {
    console.warn("[engine] ENGINE_KR_PREV_CLOSE_JSON 파싱 실패");
    return {};
  }
}

/**
 * 장시간 실행용 오케스트레이터 (PC·VPS·Docker 등).
 * Vercel 서버리스에는 부적합합니다.
 */
export function startGlobalMarketEngine(): { stop: () => void } {
  const stoppers: Array<() => void> = [];

  const usSyms = parseList(process.env.ENGINE_US_SYMBOLS);
  if (usSyms.length && process.env.FINNHUB_API_KEY) {
    console.log("[engine] US Finnhub:", usSyms.join(", "));
    stoppers.push(
      startFinnhubUsEngine({
        symbols: usSyms,
        thresholdPct: Number(process.env.ENGINE_US_THRESHOLD_PCT || 20),
        upsertMinMs: Number(process.env.ENGINE_UPSERT_MIN_MS || 15_000),
        onHotStock: (row) =>
          console.log(`[HOT US] ${row.ticker} ${row.changePct}% vol=${row.volume}`),
      }).stop
    );
  } else {
    console.log("[engine] US 건너뜀 (FINNHUB_API_KEY 또는 ENGINE_US_SYMBOLS 없음)");
  }

  const krCodes = parseList(process.env.ENGINE_KR_CODES);
  const krPrev = parsePrevCloseJson(process.env.ENGINE_KR_PREV_CLOSE_JSON);
  if (krCodes.length && process.env.KIS_APP_KEY && Object.keys(krPrev).length > 0) {
    console.log("[engine] KR KIS:", krCodes.join(", "));
    stoppers.push(
      startKisKrStream({
        codes: krCodes,
        prevCloseByCode: krPrev,
        thresholdPct: Number(process.env.ENGINE_KR_THRESHOLD_PCT || 15),
        upsertMinMs: Number(process.env.ENGINE_UPSERT_MIN_MS || 15_000),
        onHot: (row) => console.log(`[HOT KR] ${row.ticker} ${row.changePct}%`),
      }).stop
    );
  } else {
    console.log("[engine] KR 건너뜀 (KIS 키·종목·ENGINE_KR_PREV_CLOSE_JSON 필요)");
  }

  const jpCodes = parseList(process.env.ENGINE_JP_CODES);
  if (jpCodes.length && process.env.JQUANTS_MAIL) {
    console.log("[engine] JP J-Quants poll:", jpCodes.join(", "));
    stoppers.push(
      startJQuantsPollLoop({
        codes: jpCodes,
        onHot: (row) => console.log(`[HOT JP] ${row.ticker} ${row.changePct}%`),
      }).stop
    );
  } else {
    console.log("[engine] JP 건너뜀 (JQUANTS_MAIL 또는 ENGINE_JP_CODES 없음)");
  }

  return {
    stop: () => stoppers.forEach((s) => s()),
  };
}
