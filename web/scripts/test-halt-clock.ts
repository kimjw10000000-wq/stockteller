/**
 *   npx tsx scripts/test-halt-clock.ts
 */
import { haltCardFace, isVolatilityReason, mergeHaltCards, openHaltCount } from "../lib/halts/halt-board";
import { countdownMs, formatCountdown, HALT_SLOT_MS, keepResumedCard } from "../lib/halts/halt-clock";
import { applyHaltSignal } from "../lib/halts/halt-live";
import { signalFromLuld, signalFromQuote } from "../lib/halts/halt-signals";
import type { TradeHaltItem } from "../lib/halts/nasdaq-trade-halts";

function assert(cond: boolean, message: string): void {
  if (!cond) throw new Error(message);
}

const start = 1_000_000;
assert(countdownMs(start, start) === HALT_SLOT_MS, "full slot at the start");
assert(countdownMs(start, start + 60_000) === HALT_SLOT_MS - 60_000, "one minute left in the slot");
assert(countdownMs(start, start + HALT_SLOT_MS) === HALT_SLOT_MS, "resets when the slot ends");
assert(countdownMs(start, start + HALT_SLOT_MS + 15_000) === HALT_SLOT_MS - 15_000, "second slot");
assert(formatCountdown(5_000) === "0:05", "five seconds");
assert(formatCountdown(HALT_SLOT_MS) === "5:00", "five minutes");
assert(isVolatilityReason("LUDP") && isVolatilityReason("M") && isVolatilityReason("T5"), "volatility codes");
assert(!isVolatilityReason("T1") && !isVolatilityReason("H10") && !isVolatilityReason("T12") && !isVolatilityReason("M1"), "open-ended codes");
const newsFace = haltCardFace(
  { ticker: "X", name: "X", market: "", kind: "news", reasonCode: "T1", reasonLabel: "", haltedAt: start, resumedAt: null, scheduledResumeAt: null },
  start + 1000,
);
assert(!newsFace.timed && !newsFace.resumed, "news has no timer");
const volFace = haltCardFace(
  { ticker: "Y", name: "Y", market: "", kind: "volatility", reasonCode: "LUDP", reasonLabel: "", haltedAt: start, resumedAt: null, scheduledResumeAt: null },
  start,
);
assert(volFace.timed && volFace.countdown === "5:00", "volatility timer");

const luldHalt = signalFromLuld({ T: "saFx", i: [17], z: 3, t: 1_700_000_000_000 });
assert(luldHalt?.action === "halt" && luldHalt.ticker === "SAFX" && luldHalt.market === "Nasdaq", "luld halt");
const luldBand = signalFromLuld({ T: "AAPL", i: [16], z: 3, t: 1_700_000_000_000 });
assert(luldBand == null, "band update is not a halt");
const quoteHalt = signalFromQuote({ sym: "IBM", c: 43, i: [117], z: 1, t: 1_700_000_000_000 });
assert(quoteHalt?.action === "halt" && quoteHalt.market === "NYSE" && quoteHalt.kind === "volatility", "nyse quote halt");
const quoteNews = signalFromQuote({ sym: "T", c: 27, i: [], z: 1, t: 1_700_000_000_000 });
assert(quoteNews?.kind === "news" && quoteNews.action === "halt", "news halt");
const quoteResume = signalFromQuote({ sym: "IBM", c: 16, i: [116], z: 1, t: 1_700_000_005_000 });
assert(quoteResume?.action === "resume", "quote resume");

applyHaltSignal(luldHalt!);
applyHaltSignal({ ...luldHalt!, at: luldHalt!.at + 10_000 });
applyHaltSignal(quoteResume!);
applyHaltSignal(quoteHalt!);
applyHaltSignal(quoteResume!);

function rssRow(partial: Pick<TradeHaltItem, "symbol" | "reasonCode" | "haltTime"> & Partial<TradeHaltItem>): TradeHaltItem {
  return {
    name: partial.symbol,
    market: "NASDAQ",
    reasonLabel: partial.reasonCode,
    haltDate: "10/19/2026",
    pauseThresholdPrice: null,
    resumptionDate: null,
    resumptionQuoteTime: null,
    resumptionTradeTime: null,
    hasResumptionSchedule: false,
    status: "halted",
    source: "nasdaq-rss",
    ...partial,
  };
}

const now = Date.parse("2026-10-19T16:00:00.000Z");
const piled = mergeHaltCards(
  [],
  [
    rssRow({ symbol: "FUFU", reasonCode: "LUDP", haltTime: "09:31:00" }),
    rssRow({ symbol: "FUFU", reasonCode: "LUDP", haltTime: "09:38:00" }),
    rssRow({ symbol: "FUFU", reasonCode: "LUDP", haltTime: "09:44:00", resumptionTradeTime: "09:49:00", resumptionDate: "10/19/2026" }),
    rssRow({ symbol: "IBO", reasonCode: "M", haltTime: "11:50:00" }),
    rssRow({ symbol: "SLN", reasonCode: "T3", haltTime: "08:20:00" }),
    rssRow({ symbol: "TJGC", reasonCode: "H10", haltTime: "19:50:00" }),
    rssRow({ symbol: "IRON", reasonCode: "T12", haltTime: "07:20:00", resumptionTradeTime: "15:00:00", resumptionDate: "10/19/2026", hasResumptionSchedule: true }),
    rssRow({ symbol: "SAMSUNG", reasonCode: "VI_STATIC", haltTime: "01:00:00", market: "KOSPI" }),
  ],
  now,
);
assert(piled.map((card) => card.ticker).join(",") === "IBO,SLN,IRON,FUFU", `rss board ${piled.map((c) => c.ticker).join(",")}`);
assert(piled.filter((card) => card.ticker === "FUFU").length === 1, "resumed repeats stay one card");
const fufu = piled.find((card) => card.ticker === "FUFU");
assert(fufu != null && haltCardFace(fufu, now).resumed, "today's resume stays on the board");
assert(openHaltCount(piled, now) === 3, "open count");
const nextDay = Date.parse("2026-10-20T16:00:00.000Z");
assert(!keepResumedCard(fufu!.haltedAt, fufu!.resumedAt, nextDay), "yesterday's resume leaves the next US day");
const sln = piled.find((card) => card.ticker === "SLN");
assert(sln != null && !haltCardFace(sln, now).timed, "T3 has no timer");
const iron = piled.find((card) => card.ticker === "IRON");
assert(iron != null && haltCardFace(iron, now).timed, "confirmed resume gets a clock");

const one = mergeHaltCards(
  [
    { ticker: "FUFU", market: "Nasdaq", kind: "volatility", haltedAt: now - 60_000, resumedAt: null },
    { ticker: "FUFU", market: "Nasdaq", kind: "volatility", haltedAt: now - 10_000, resumedAt: null },
    { ticker: "NEWS", market: "NYSE", kind: "news", haltedAt: now - 5_000, resumedAt: null },
  ],
  [rssRow({ symbol: "FUFU", reasonCode: "LUDP", haltTime: "09:31:00", name: "Fufu Co" })],
  now,
);
assert(one.length === 1 && one[0]?.ticker === "FUFU" && one[0].kind === "volatility", "one volatility card");
assert(one[0]?.name === "Fufu Co", "polygon card keeps the nasdaq name");
assert(haltCardFace(one[0]!, now).countdown === "4:00", "repeat halt keeps the first clock");

const resumedMidTimer = mergeHaltCards(
  [{ ticker: "AMRO", market: "Nasdaq", kind: "volatility", haltedAt: now - 4 * 60_000, resumedAt: null }],
  [rssRow({ symbol: "AMRO", reasonCode: "LUDP", haltTime: "11:56:00", resumptionTradeTime: "11:58:30", resumptionDate: "10/19/2026" })],
  now,
);
const amro = resumedMidTimer.find((card) => card.ticker === "AMRO");
assert(amro != null && haltCardFace(amro, now).resumed, "nasdaq resume cuts the timer");

const polygonResume = mergeHaltCards(
  [{ ticker: "GAUZ", market: "Nasdaq", kind: "volatility", haltedAt: now - 6 * 60_000, resumedAt: now - 60_000 }],
  [rssRow({ symbol: "GAUZ", reasonCode: "LUDP", haltTime: "11:54:00" })],
  now,
);
const gauz = polygonResume.find((card) => card.ticker === "GAUZ");
assert(gauz != null && haltCardFace(gauz, now).resumed, "polygon resume cuts the timer before nasdaq");
const stringResume = signalFromLuld({ T: "GAUZ", i: "18", z: 3, t: now });
assert(stringResume?.action === "resume", "string indicator 18 is a resume");

console.log("halt clock ok");
