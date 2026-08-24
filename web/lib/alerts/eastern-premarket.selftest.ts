/**
 * Run: npx tsx lib/alerts/eastern-premarket.selftest.ts
 */
import {
  canDispatchDilutionAlert,
  canSendFreeAlertThisWindow,
  getLatestPremarketResetUtc,
  getNextPremarketResetUtc,
  zonedWallTimeToUtc,
} from "./eastern-premarket";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function iso(d: Date): string {
  return d.toISOString();
}

const ET = "America/New_York";

// 2026-08-24 04:00 EDT = 08:00 UTC
const summerReset = zonedWallTimeToUtc(2026, 8, 24, 4, 0, 0, ET);
assert(iso(summerReset) === "2026-08-24T08:00:00.000Z", `summer 4am ET → UTC got ${iso(summerReset)}`);

// 2026-01-15 04:00 EST = 09:00 UTC
const winterReset = zonedWallTimeToUtc(2026, 1, 15, 4, 0, 0, ET);
assert(iso(winterReset) === "2026-01-15T09:00:00.000Z", `winter 4am ET → UTC got ${iso(winterReset)}`);

// After 4am ET: latest reset is today 4am
const afterOpen = new Date("2026-08-24T16:30:00.000Z"); // 12:30 EDT
assert(
  iso(getLatestPremarketResetUtc(afterOpen)) === "2026-08-24T08:00:00.000Z",
  "afternoon uses today's 4am"
);
assert(
  iso(getNextPremarketResetUtc(afterOpen)) === "2026-08-25T08:00:00.000Z",
  "next reset is tomorrow 4am"
);

// Before 4am ET: latest reset is yesterday 4am
const beforeOpen = new Date("2026-08-24T07:59:00.000Z"); // 03:59 EDT
assert(
  iso(getLatestPremarketResetUtc(beforeOpen)) === "2026-08-23T08:00:00.000Z",
  "3:59am uses yesterday 4am"
);
assert(
  iso(getNextPremarketResetUtc(beforeOpen)) === "2026-08-24T08:00:00.000Z",
  "3:59am next is today's 4am"
);

// Exactly 4:00 AM ET counts as the new window
const exactly = new Date("2026-08-24T08:00:00.000Z");
assert(
  iso(getLatestPremarketResetUtc(exactly)) === "2026-08-24T08:00:00.000Z",
  "exact 4am is today's reset"
);
assert(
  iso(getNextPremarketResetUtc(exactly)) === "2026-08-25T08:00:00.000Z",
  "exact 4am next is tomorrow"
);

// Not a rolling 24h cooldown: triggered at 10:00 ET, still blocked at 09:00 ET next calendar morning (before 4am)
const triggeredTenAm = new Date("2026-08-24T14:00:00.000Z"); // 10:00 EDT
const nextMorningThree = new Date("2026-08-25T07:00:00.000Z"); // 03:00 EDT next day
assert(
  canSendFreeAlertThisWindow(triggeredTenAm, nextMorningThree) === false,
  "before next 4am still blocked even if 17h passed"
);
const nextMorningFour = new Date("2026-08-25T08:00:00.000Z"); // 04:00 EDT next day
assert(
  canSendFreeAlertThisWindow(triggeredTenAm, nextMorningFour) === true,
  "resets at 4am ET regardless of trigger clock"
);

// Triggered 3:59am belongs to previous window; after 4am can send again
const triggeredPreReset = new Date("2026-08-24T07:59:00.000Z");
assert(
  canSendFreeAlertThisWindow(triggeredPreReset, exactly) === true,
  "pre-4am send does not consume the new window"
);

assert(canDispatchDilutionAlert({ isPro: true, lastTriggeredAt: triggeredTenAm, now: afterOpen }) === true, "pro unlimited");
assert(canDispatchDilutionAlert({ isPro: false, lastTriggeredAt: triggeredTenAm, now: afterOpen }) === false, "free blocked same window");
assert(canDispatchDilutionAlert({ isPro: false, lastTriggeredAt: null, now: afterOpen }) === true, "free first send");

// DST spring forward 2026-03-08: 4:00 AM EDT = 08:00 UTC
const dstMorning = new Date("2026-03-08T12:00:00.000Z");
assert(
  iso(getLatestPremarketResetUtc(dstMorning)) === "2026-03-08T08:00:00.000Z",
  `DST spring 4am got ${iso(getLatestPremarketResetUtc(dstMorning))}`
);

console.log("eastern-premarket.selftest ok");
