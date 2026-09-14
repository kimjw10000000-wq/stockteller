/**
 *   npx tsx scripts/test-washout-score.ts
 */
import {
  lookupDd,
  paintDown,
  peakBarDtMinutes,
  peakResetIndices,
  sessionStepMinutes,
  washoutIndexAverage,
  washoutIndexPath,
  washoutScoreForIndex,
  washoutScoreSeries,
  WASHOUT_TRACK_SESSION_MIN,
} from "../lib/us-market/washout-score";
import {
  etWallMs,
  previousEtWeekday,
  tapeDayElapsedMin,
  TAPE_DAY_SESSION_MIN,
} from "../lib/us-market/us-session";

const g = new Map<number, number>();
console.log("200→150 dd25", paintDown(g, 0, 25).toFixed(1), "(기대 625)");
console.log("같은 선에서 dd20", lookupDd(g, 20).toFixed(1), "(기대 500)");
console.log("150→120 dd25→40", paintDown(g, 25, 40).toFixed(1), "(기대 850)");

const g2 = new Map<number, number>();
paintDown(g2, 0, 30);
console.log("0→30 후 dd20 조회", lookupDd(g2, 20).toFixed(1), "(기대 600)");
console.log("20→40 완만한 추가", paintDown(g2, 20, 40).toFixed(1), "(기대 1100)");

const g3 = new Map<number, number>();
paintDown(g3, 0, 30);
console.log("20→60 가파른 덮기 dd30", paintDown(g3, 20, 60).toFixed(0), "dd30=", lookupDd(g3, 30).toFixed(0), "(기대 1000)");

const series = washoutScoreSeries(
  [
    { t: 0, price: 100 },
    { t: 60_000, price: 200, open: 100 },
    { t: 120_000, price: 150, open: 200 },
    { t: 180_000, price: 160, open: 150 },
    { t: 240_000, price: 120, open: 160 },
    { t: 300_000, price: 220, open: 120, high: 220 },
  ],
  100
);
console.log(
  "가격 시퀀스",
  series.map((p) => `${p.price} dd${p.ddPct.toFixed(0)}→${p.score.toFixed(0)}`).join("  ")
);
console.log("새 고점 점수 리셋", series[5].score.toFixed(0), "(기대 0)");

const overnightStep = sessionStepMinutes(
  Date.parse("2026-05-11T19:58:00-04:00"),
  Date.parse("2026-05-12T04:00:00-04:00")
);
console.log("장외 갭 분", overnightStep, "(기대 1, 벽시계 8시간이 아님)");

function rth(min: number) {
  return Date.parse("2026-05-12T10:00:00-04:00") + min * 60_000;
}
const hold = washoutScoreSeries(
  [
    { t: rth(0), price: 140, high: 140 },
    { t: rth(1), price: 140, high: 140 },
    { t: rth(2), price: 140, high: 140 },
  ],
  100
);
console.log(
  "계속 +40% 한도",
  hold[2].sessionQuotaMin,
  "(기대",
  WASHOUT_TRACK_SESSION_MIN,
  ")"
);

const recap = washoutScoreSeries(
  [
    { t: rth(0), price: 140, high: 140 },
    { t: rth(1), price: 110, high: 110 },
    { t: rth(2), price: 140, high: 140 },
  ],
  100
);
console.log(
  "같은 종가 재돌파 한도/경과",
  recap[2].sessionQuotaMin.toFixed(0),
  recap[2].sessionElapsedMin.toFixed(0),
  "(기대 720 / 3, 같은 날 30% 재돌파는 연장 없음)"
);

const eightHours: { t: number; price: number; high: number }[] = [
  { t: rth(0), price: 140, high: 140 },
];
for (let i = 1; i < 480; i++) eightHours.push({ t: rth(i), price: 110, high: 110 });
eightHours.push({ t: rth(480), price: 140, high: 140 });
const stacked = washoutScoreSeries(eightHours, 100);
const last = stacked[stacked.length - 1];
console.log(
  "8h 후 같은 종가 재돌파 한도/경과",
  last.sessionQuotaMin.toFixed(0),
  last.sessionElapsedMin.toFixed(0),
  last.tracking,
  "(기대 720 / ~481, 추적 유지)"
);

const roll = washoutScoreSeries(
  [
    { t: rth(0), price: 140, high: 140, prevClose: 100 },
    { t: rth(1), price: 140, high: 140, prevClose: 100 },
    { t: rth(2), price: 140, high: 140, prevClose: 90 },
  ],
  100
);
console.log(
  "새 종가 대비 +30% 한도/경과",
  roll[2].sessionQuotaMin.toFixed(0),
  roll[2].sessionElapsedMin.toFixed(0),
  "(기대 720 / 1, 종가 롤 후 12시간 다시)"
);

const rthDay = "2026-09-08";
const ahRecap = washoutScoreSeries(
  [
    { t: etWallMs(rthDay, 14, 0), price: 140, high: 140, prevClose: 100 },
    { t: etWallMs(rthDay, 15, 30), price: 110, high: 110, prevClose: 100 },
    { t: etWallMs(rthDay, 16, 30), price: 180, high: 180, prevClose: 110 },
  ],
  100
);
console.log(
  "애프터 새종가 +30% 한도/경과",
  ahRecap[2].sessionQuotaMin.toFixed(0),
  ahRecap[2].sessionElapsedMin.toFixed(0),
  ahRecap[2].tracking,
  "(기대 720 / 1, 본장 종료 후에도 추적 유지하다 앱장에서 다시 12h)"
);

console.log("지수 평균 625+850", washoutIndexAverage([625, 850]).toFixed(1), "(기대 737.5)");
console.log("빈 유니버스 평균", washoutIndexAverage([]), "(기대 0)");
console.log("캡 2500", washoutScoreForIndex(2500).toFixed(0), "(기대 2500)");
console.log("캡 15000", washoutScoreForIndex(15000).toFixed(0), "(기대 5600)");
console.log("지수 평균 15000+2500", washoutIndexAverage([15000, 2500]).toFixed(0), "(기대 4050)");

const path = washoutIndexPath([
  [
    { t: 0, price: 0, peakPrice: 0, ddPct: 0, minuteChange: 0, minuteScore: 0, score: 100, tracking: true, sessionElapsedMin: 1, sessionQuotaMin: 720 },
    { t: 60_000, price: 0, peakPrice: 0, ddPct: 0, minuteChange: 0, minuteScore: 0, score: 200, tracking: true, sessionElapsedMin: 2, sessionQuotaMin: 720 },
  ],
  [
    { t: 0, price: 0, peakPrice: 0, ddPct: 0, minuteChange: 0, minuteScore: 0, score: 50, tracking: true, sessionElapsedMin: 1, sessionQuotaMin: 720 },
    { t: 60_000, price: 0, peakPrice: 0, ddPct: 0, minuteChange: 0, minuteScore: 0, score: 80, tracking: true, sessionElapsedMin: 2, sessionQuotaMin: 720 },
  ],
]);
console.log("지수 경로", path.map((p) => p.score).join(","), "(기대 75,140)");

const peakIdx = peakResetIndices(
  washoutScoreSeries(
    [
      { t: 0, price: 130, high: 130 },
      { t: 60_000, price: 100, high: 100 },
      { t: 120_000, price: 160, high: 160 },
    ],
    100
  )
);
console.log("고점 분 인덱스", peakIdx.join(","), "(기대 0,2)");

const tape = "2026-09-09";
const prev = previousEtWeekday(tape);
const twoHoursPre = etWallMs(tape, 6, 0);
const twoHoursElapsed = tapeDayElapsedMin(twoHoursPre, tape);
console.log(
  "프장 2시간 경과분",
  twoHoursElapsed.toFixed(0),
  "축비율",
  (twoHoursElapsed / TAPE_DAY_SESSION_MIN).toFixed(3),
  "(기대 360 / 0.375)"
);
console.log(
  "전날 애프터 종료",
  tapeDayElapsedMin(etWallMs(prev, 20, 0), tape).toFixed(0),
  "(기대 240)"
);
console.log(
  "본장 시작",
  tapeDayElapsedMin(etWallMs(tape, 9, 30), tape).toFixed(0),
  "(기대 570)"
);
console.log(
  "본장 종료=하루",
  tapeDayElapsedMin(etWallMs(tape, 16, 0), tape).toFixed(0),
  TAPE_DAY_SESSION_MIN,
  "(기대 960)"
);

const sessionGap = washoutScoreSeries(
  [
    { t: etWallMs(prev, 16, 30), price: 200, open: 200, high: 200 },
    { t: etWallMs(tape, 4, 5), price: 100, open: 100, high: 400 },
  ],
  100
);
console.log(
  "세션 전환 가짜고가",
  sessionGap[1].score.toFixed(0),
  sessionGap[1].peakPrice,
  "(기대 점수 0, peak 200 — 애프터→프리 갭/호가 무시)"
);

const sessionDump = washoutScoreSeries(
  [
    { t: rth(0), price: 200, open: 200, high: 200 },
    { t: rth(1), price: 100, open: 200, high: 200 },
  ],
  100
);
console.log(
  "같은 세션 급락",
  sessionDump[1].score.toFixed(0),
  "(기대 ≫ 0)"
);

const peakMin = rth(0);
const peakFullMin = washoutScoreSeries(
  [
    {
      t: peakMin,
      price: 150,
      open: 200,
      high: 200,
      peakAt: peakMin,
      closeAt: peakMin + 60_000,
    },
  ],
  100
);
console.log(
  "고점분 1분 종가",
  peakFullMin[0].score.toFixed(0),
  peakBarDtMinutes(peakMin, peakMin + 60_000).toFixed(2),
  "(기대 625 / dt 1)"
);

const peakLate = washoutScoreSeries(
  [
    {
      t: peakMin,
      price: 150,
      open: 200,
      high: 200,
      peakAt: peakMin + 50_000,
      closeAt: peakMin + 60_000,
    },
  ],
  100
);
console.log(
  "고점분 10초 종가",
  peakLate[0].score.toFixed(0),
  peakBarDtMinutes(peakMin + 50_000, peakMin + 60_000).toFixed(3),
  "(기대 3750 / dt 0.167)"
);

const carry = washoutScoreSeries(
  [
    { t: etWallMs(rthDay, 10, 30), price: 200, open: 200, high: 200 },
    { t: etWallMs(rthDay, 15, 59), price: 100, open: 200, high: 200 },
    { t: etWallMs(rthDay, 16, 30), price: 100, open: 100, high: 100 },
  ],
  100
);
console.log(
  "본장 고점→애프터 유지",
  carry[2].peakPrice,
  carry[2].score.toFixed(0),
  "(기대 peak 200, 점수 ≫ 0)"
);
