import { activeTapeSession, etWallMs, previousEtWeekday } from "../lib/us-market/us-session";
import { sessionSlotX, washoutCompareAt, washoutComparePaths } from "../lib/us-market/washout-compare";

function expect(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
  console.log("ok", msg);
}

const tape = "2026-09-22";
const at = etWallMs(tape, 12, 5);
const rows: Array<{ t: number; v: number; tape_date: string }> = [];

for (let i = 1; i <= 20; i++) {
  let day = tape;
  for (let n = 0; n < i; n++) day = previousEtWeekday(day);
  rows.push({ t: etWallMs(day, 12, 5), v: 100 + i * 10, tape_date: day });
  rows.push({ t: etWallMs(day, 10, 0), v: 50, tape_date: day });
}

const got = washoutCompareAt(rows, at, tape);
expect(got.session === "regular", `session ${got.session}`);
expect(got.yesterday === 110, `yesterday ${got.yesterday}`);
expect(got.days5 === 5, `days5 ${got.days5}`);
expect(got.days20 === 20, `days20 ${got.days20}`);
expect(Math.round(got.avg5 ?? 0) === 130, `avg5 ${got.avg5}`);
expect(Math.round(got.avg20 ?? 0) === 205, `avg20 ${got.avg20}`);

const open = washoutCompareAt(
  [
    { t: etWallMs(previousEtWeekday(tape), 9, 31), v: 80, tape_date: previousEtWeekday(tape) },
    { t: etWallMs(tape, 9, 30), v: 90, tape_date: tape },
  ],
  etWallMs(tape, 9, 30),
  tape
);
expect(open.yesterday === 80, `open slack ${open.yesterday}`);

const pre = washoutCompareAt(rows, etWallMs(tape, 8, 0), tape);
expect(pre.session === "premarket", `pre session ${pre.session}`);
expect(pre.yesterday == null, "pre has no yesterday match");

const paths = washoutComparePaths(rows, tape, [{ t: at }]);
expect(paths.yesterday[0]?.v === 110, `path yesterday ${paths.yesterday[0]?.v}`);
expect(Math.round(paths.avg5[0]?.v ?? 0) === 130, `path avg5 ${paths.avg5[0]?.v}`);

const rthOpen = etWallMs(tape, 9, 30);
const rthMid = etWallMs(tape, 12, 45);
expect(sessionSlotX(rthOpen, tape, 0, 1, "regular", false) === 0, "rth open sits at the left");
const midX = sessionSlotX(rthMid, tape, 0, 1, "regular", false);
expect(Math.abs(midX - 0.5) < 0.002, `rth midpoint fills half the cell ${midX}`);
expect(sessionSlotX(etWallMs(tape, 8, 0), tape, 0, 1, "regular", false) < 0, "premarket is outside the rth cell");
const secondOpen = sessionSlotX(rthOpen, tape, 1, 2, "regular", false);
expect(Math.abs(secondOpen - 0.5) < 1e-9, `next day rth starts at half ${secondOpen}`);
expect(activeTapeSession(new Date(etWallMs(tape, 12, 0))) === "regular", "noon defaults to rth");
expect(activeTapeSession(new Date(etWallMs(tape, 7, 0))) === "premarket", "7am defaults to premarket");
expect(activeTapeSession(new Date(etWallMs(tape, 18, 0))) === "afterhours", "6pm defaults to after hours");

console.log("washout-compare ok");
