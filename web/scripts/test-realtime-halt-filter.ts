import {
  filterRealtimeHaltItems,
  isKoreanHaltMarket,
  isPastUsAftermarketClose,
  isVolatilityTradingPauseCode,
  shouldHideFromRealtimeHaltView,
} from "../lib/halts/realtime-filter";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(isVolatilityTradingPauseCode("LUDP"), "LUDP");
assert(isVolatilityTradingPauseCode("ludp"), "ludp");
assert(isVolatilityTradingPauseCode("M"), "AMEX M");
assert(!isVolatilityTradingPauseCode("M1"), "M1 is not AMEX volatility pause");
assert(!isVolatilityTradingPauseCode("T1"), "T1");
assert(!isVolatilityTradingPauseCode("T12"), "T12");
assert(!isVolatilityTradingPauseCode("T5"), "T5");
assert(!isVolatilityTradingPauseCode("VI_STATIC"), "Toss VI");
assert(isKoreanHaltMarket("KOSPI"), "KOSPI");
assert(isKoreanHaltMarket("KOSDAQ"), "KOSDAQ");
assert(isKoreanHaltMarket("KONEX"), "KONEX");
assert(!isKoreanHaltMarket("NASDAQ"), "NASDAQ stays");
assert(!isKoreanHaltMarket("NYSE"), "NYSE stays");
assert(!isKoreanHaltMarket(""), "blank market stays");

const halt = {
  haltDate: "08/14/2026",
  resumptionDate: "08/14/2026",
  resumptionTradeTime: "10:05:00",
};

// 2026-08-14 is EDT (UTC-4)
const sameDay1559Et = Date.UTC(2026, 7, 14, 19, 59, 0); // 15:59 ET
const sameDay1959Et = Date.UTC(2026, 7, 14, 23, 59, 0); // 19:59 ET
const sameDay2000Et = Date.UTC(2026, 7, 15, 0, 0, 0); // 20:00 ET
const nextMorningEt = Date.UTC(2026, 7, 15, 13, 30, 0); // 09:30 ET next day

assert(!isPastUsAftermarketClose("08/14/2026", sameDay1559Et), "before close 15:59");
assert(!isPastUsAftermarketClose("08/14/2026", sameDay1959Et), "before close 19:59");
assert(isPastUsAftermarketClose("08/14/2026", sameDay2000Et), "at 20:00 ET");
assert(isPastUsAftermarketClose("08/14/2026", nextMorningEt), "next ET day");

assert(
  !shouldHideFromRealtimeHaltView({ ...halt, reasonCode: "LUDP" }, sameDay1559Et),
  "resumed LUDP still visible during session"
);
assert(
  shouldHideFromRealtimeHaltView({ ...halt, reasonCode: "LUDP" }, sameDay2000Et),
  "resumed LUDP hidden after aftermarket"
);
assert(
  shouldHideFromRealtimeHaltView({ ...halt, reasonCode: "M" }, sameDay2000Et),
  "resumed AMEX M hidden after aftermarket"
);
assert(
  !shouldHideFromRealtimeHaltView(
    { ...halt, reasonCode: "LUDP", resumptionTradeTime: null },
    sameDay2000Et
  ),
  "unresolved LUDP stays after close"
);
assert(
  !shouldHideFromRealtimeHaltView({ ...halt, reasonCode: "T1" }, sameDay2000Et),
  "T1 stays even if resume time set"
);
assert(
  !shouldHideFromRealtimeHaltView({ ...halt, reasonCode: "T12" }, nextMorningEt),
  "T12 stays next day"
);

const items = filterRealtimeHaltItems(
  [
    { ...halt, reasonCode: "LUDP", symbol: "AAA" },
    { ...halt, reasonCode: "T12", symbol: "BBB", resumptionTradeTime: null },
    { ...halt, reasonCode: "M", symbol: "CCC" },
    { ...halt, reasonCode: "T1", symbol: "DDD", resumptionTradeTime: null },
    { ...halt, reasonCode: "VI_STATIC", symbol: "005930", market: "KOSPI", resumptionTradeTime: null },
    { ...halt, reasonCode: "H10", symbol: "TJGC", market: "NASDAQ", resumptionTradeTime: null },
  ],
  sameDay2000Et
);
assert(
  items.map((i) => i.symbol).join(",") === "BBB,DDD,TJGC",
  `filter leftover ${items.map((i) => i.symbol).join(",")}`
);

console.log("test-realtime-halt-filter: ok");
