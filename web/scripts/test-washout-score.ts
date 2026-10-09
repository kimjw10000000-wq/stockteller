/**
 *   npx tsx scripts/test-washout-score.ts
 */
import {
  lookupDd,
  paintDown,
  peakBarDtMinutes,
  peakResetIndices,
  sessionStepMinutes,
  specialTickersAfterRth,
  stillTrackingAt,
  trackingOriginMs,
  intervalGapWeight,
  intervalGapWeightFromTimes,
  isRthCircuitResume,
  washoutIndexAverage,
  washoutIndexPath,
  washoutIndexPathDetailed,
  washoutReactionIndexPath,
  WASHOUT_REACTION_MS,
  washoutScoreForIndex,
  washoutScoreSeries,
} from "../lib/us-market/washout-score";
import {
  etWallMs,
  holdSessionEndMinute,
  isSessionEndMinute,
  previousEtWeekday,
  sessionMinutesBetween,
  addSessionMinutes,
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
  TAPE_DAY_SESSION_MIN,
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
  "(기대 960 / 3, 같은 세션 30% 재돌파는 연장 없음)"
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
  "(기대 960 / 1, 18:00은 다음 테이프 재포착)"
);

function pre(min: number) {
  return Date.parse("2026-05-12T04:00:00-04:00") + min * 60_000;
}
const onceADay: { t: number; price: number; high: number }[] = [
  { t: pre(0), price: 140, high: 140 },
];
for (let i = 1; i <= 720; i++) onceADay.push({ t: pre(i), price: 110, high: 110 });
onceADay.push({ t: pre(721), price: 140, high: 140 });
const onceSeries = washoutScoreSeries(onceADay, 100);
console.log(
  "12h 종료 후 앱장 재급등",
  onceSeries[720].tracking,
  onceSeries[721].tracking,
  "(기대 false / true, 16:00부터 다음 테이프)"
);

const nextDay = washoutScoreSeries(
  [
    ...onceADay,
    { t: Date.parse("2026-05-13T10:00:00-04:00"), price: 140, high: 140 },
  ],
  100
);
console.log(
  "다음날 본장 재부여",
  nextDay[nextDay.length - 1].tracking,
  "(기대 true)"
);

const monTape = "2026-05-11";
const sameTapeBlocked = washoutScoreSeries(
  [{ t: Date.parse("2026-05-11T10:00:00-04:00"), price: 140, high: 140 }],
  100,
  { grantedOn: monTape }
);
const monAhGrant = washoutScoreSeries(
  [{ t: Date.parse("2026-05-11T17:00:00-04:00"), price: 140, high: 140 }],
  100,
  { grantedOn: monTape }
);
const monPreBlocked = washoutScoreSeries(
  [{ t: Date.parse("2026-05-11T05:00:00-04:00"), price: 140, high: 140 }],
  100,
  { grantedOn: monTape }
);
console.log(
  "같은 테이프 본장/프장도 세션마다 재포착, 부여 플래그는 막지 않음",
  sameTapeBlocked[0].tracking,
  monPreBlocked[0].tracking,
  monAhGrant[0].tracking,
  "(기대 true / true / true)"
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
  "(기대 960 / 3, 종가 롤은 한도를 더하지 않음)"
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
  ahRecap[2].peakPrice,
  "(기대 960 / 새 경과, 본장 종료 후 앱장은 다음 테이프·고점 리셋)"
);

console.log("지수 평균 625+850", washoutIndexAverage([625, 850]).toFixed(1), "(기대 737.5)");
console.log("빈 유니버스 평균", washoutIndexAverage([]), "(기대 0)");
console.log("캡 2500", washoutScoreForIndex(2500).toFixed(0), "(기대 2500)");
console.log("캡 15000", washoutScoreForIndex(15000).toFixed(0), "(기대 5600)");
console.log("지수 평균 15000+2500", washoutIndexAverage([15000, 2500]).toFixed(0), "(기대 4050)");

const path = washoutIndexPath([
  [
    { t: 0, price: 0, peakPrice: 0, peakAt: 0, captureAt: 0, ddPct: 0, minuteChange: 0, minuteScore: 0, score: 100, tracking: true, sessionElapsedMin: 1, sessionQuotaMin: 720 },
    { t: 60_000, price: 0, peakPrice: 0, peakAt: 0, captureAt: 0, ddPct: 0, minuteChange: 0, minuteScore: 0, score: 200, tracking: true, sessionElapsedMin: 2, sessionQuotaMin: 720 },
  ],
  [
    { t: 0, price: 0, peakPrice: 0, peakAt: 0, captureAt: 0, ddPct: 0, minuteChange: 0, minuteScore: 0, score: 50, tracking: true, sessionElapsedMin: 1, sessionQuotaMin: 720 },
    { t: 60_000, price: 0, peakPrice: 0, peakAt: 0, captureAt: 0, ddPct: 0, minuteChange: 0, minuteScore: 0, score: 80, tracking: true, sessionElapsedMin: 2, sessionQuotaMin: 720 },
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
  sessionGap[1].tracking,
  "(기대 점수 0, peak 0, 미추적 — 애프터 고점·갭 고가 무시)"
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
  carry[2].tracking,
  "(기대 peak 0, 점수 0, 본장→앱장은 전부 폐기)"
);

const seeded = washoutScoreSeries(
  [
    { t: 0, price: 200, open: 100, high: 200 },
    { t: 60_000, price: 180, open: 200, high: 190 },
  ],
  100,
  { seedPeak: 220 }
);
console.log(
  "추적 전 테이프 고점",
  seeded[1].peakPrice,
  seeded[1].ddPct.toFixed(1),
  seeded[1].score.toFixed(0),
  "(기대 peak 220, dd 18.2, 점수 > 0, 190으로 리셋 안 함)"
);

const ex0 = etWallMs(rthDay, 10, 45);
const spec = washoutScoreSeries(
  [
    {
      t: ex0,
      price: 1800,
      open: 1000,
      high: 2000,
      peakAt: ex0 + 15_000,
    },
    { t: ex0 + 60_000, price: 1500, open: 1800, high: 1800 },
    { t: ex0 + 120_000, price: 1600, open: 1500, high: 1600 },
    { t: ex0 + 180_000, price: 1500, open: 1600, high: 1600 },
    { t: ex0 + 240_000, price: 1000, open: 1500, high: 1500 },
    { t: ex0 + 300_000, price: 1500, open: 1000, high: 1500 },
    { t: ex0 + 360_000, price: 2100, open: 1500, high: 2100 },
  ],
  1000
);
console.log(
  "예시 고점분",
  spec[0].score.toFixed(2),
  "(기대 133.33 = 400/3)"
);
console.log("예시 1800→1500", spec[1].score.toFixed(2), "(기대 358.33 = 400/3+225)");
console.log("예시 1500→1600", spec[2].score.toFixed(2), "(기대 283.33 = 150+400/3)");
console.log("예시 1600→1500 가파른쪽", spec[3].score.toFixed(2), "(기대 358.33)");
console.log("예시 1500→1000", spec[4].score.toFixed(2), "(기대 983.33 = 400/3+225+625)");
console.log("예시 1000→1500 연속 복귀", spec[5].score.toFixed(2), "(기대 358.33)");
console.log("예시 고점 갱신 리셋", spec[6].score.toFixed(2), spec[6].peakPrice, "(기대 0 / 2100)");

const bump0 = etWallMs(rthDay, 11, 0);
const bump = washoutScoreSeries(
  [
    { t: bump0, price: 2000, open: 1000, high: 2000, peakAt: bump0 },
    {
      t: bump0 + 60_000,
      price: 2000,
      open: 2000,
      high: 2500,
      peakAt: bump0 + 60_000 + 30_000,
    },
  ],
  1000
);
console.log(
  "2000 시가→2500@30초→종가 2000",
  bump[1].peakPrice,
  bump[1].peakAt,
  bump[1].score.toFixed(0),
  "(기대 peak 2500, peakAt 분+30초, 점수 800)"
);
const replay = washoutScoreSeries(
  [
    { t: bump0, price: 2000, open: 1000, high: 2000 },
    { t: bump0 + 60_000, price: 2000, open: 2000, high: 2500 },
  ],
  1000,
  { savedPeakAt: bump0 + 60_000 + 30_000 }
);
console.log(
  "DB 고점초로 재계산",
  replay[1].peakAt,
  replay[1].score.toFixed(0),
  "(기대 분+30초 / 800)"
);

const recapKeep = washoutScoreSeries(
  [
    { t: etWallMs(rthDay, 13, 0), price: 2000, open: 1500, high: 2000, prevClose: 1500, peakAt: etWallMs(rthDay, 13, 0) },
    { t: etWallMs(rthDay, 15, 59), price: 1000, open: 2000, high: 2000, prevClose: 1500 },
    { t: etWallMs(rthDay, 16, 30), price: 1300, open: 1000, high: 1300, prevClose: 1000 },
  ],
  1500
);
console.log(
  "종가후 +30% 시계만 리셋",
  recapKeep[2].peakPrice,
  recapKeep[2].score.toFixed(0),
  recapKeep[2].sessionElapsedMin.toFixed(0),
  recapKeep[2].sessionQuotaMin.toFixed(0),
  recapKeep[2].tracking,
  "(기대 앱장 1300은 새 종가 대비 +30%면 재포착, 본장 고점 2000은 폐기)"
);

const t13 = etWallMs(rthDay, 13, 0);
const peak1325 = t13 + 25_000;
const lookback = washoutScoreSeries(
  [{ t: t13, price: 2000, open: 1000, high: 2000, peakAt: peak1325, prevClose: 1000 }],
  1000
);
console.log(
  "추적 시작 1분 전",
  lookback[0].sessionElapsedMin.toFixed(3),
  sessionStepMinutes(trackingOriginMs(peak1325), t13).toFixed(3),
  "(기대 고점-1분 → 분봉시각)"
);

const contig = washoutScoreSeries(
  [
    { t: etWallMs(rthDay, 13, 0), price: 2000, open: 1000, high: 2000, prevClose: 1000, peakAt: etWallMs(rthDay, 13, 0) },
    { t: etWallMs(rthDay, 16, 0), price: 1200, open: 2000, high: 1200, prevClose: 1000 },
    { t: etWallMs(rthDay, 17, 0), price: 1560, open: 1200, high: 1560, prevClose: 1200 },
    { t: etWallMs(rthDay, 19, 0), price: 2500, open: 1560, high: 2500, prevClose: 1200 },
  ],
  1000
);
console.log(
  "연속추적 2000 유지 후 2500 리셋",
  contig[2].peakPrice,
  contig[2].sessionQuotaMin.toFixed(0),
  contig[2].tracking,
  contig[3].peakPrice,
  contig[3].score.toFixed(0),
  "(기대 1560 / 960, 그다음 2500 / 0)"
);

const w30 = intervalGapWeight(30);
const w60 = intervalGapWeight(60);
const w120 = intervalGapWeight(120);
const w240 = intervalGapWeight(240);
const w330 = intervalGapWeight(330);
const w360 = intervalGapWeight(360);
const w400 = intervalGapWeight(400);
console.log("간격 <1h", w30.toFixed(2), "(기대 1.50)");
console.log("간격 1h", w60.toFixed(2), "(기대 1.50)");
console.log("간격 2h 로그", w120.toFixed(3), "(기대 1.250)");
console.log("간격 4h", w240.toFixed(2), "(기대 1.00)");
console.log("간격 5.5h 로그", w330.toFixed(3), "(기대", (1 - 0.2 * (Math.log(5.5 / 4) / Math.log(6 / 4))).toFixed(3), ")");
console.log("간격 6h", w360.toFixed(2), "(기대 0.80)");
console.log("간격 >6h", w400.toFixed(2), "(기대 0.80)");

const ahCapture = etWallMs("2026-05-11", 16, 30);
const nextPrePeak = etWallMs("2026-05-12", 6, 0);
const overnightGap = sessionMinutesBetween(ahCapture, nextPrePeak);
console.log("앱장 16:30→다음날 프장 06:00 세션분", overnightGap.toFixed(0), "(기대 330)");
console.log(
  "세션 330분 더하기",
  addSessionMinutes(ahCapture, 330) === nextPrePeak,
  "(기대 true)"
);

const friAh = etWallMs("2026-05-08", 19, 0);
const monPre = etWallMs("2026-05-11", 5, 0);
console.log("금 19:00→월 05:00 세션분", sessionMinutesBetween(friAh, monPre).toFixed(0), "(기대 120)");

const gapAvg = washoutIndexAverage([
  { score: 1000, captureAt: rth(0), peakAt: rth(30) },
  { score: 1000, captureAt: rth(0), peakAt: rth(6 * 60) },
]);
const expectGapAvg = (washoutScoreForIndex(1000 * 1.5) + washoutScoreForIndex(1000 * 0.8)) / 2;
console.log("간격 후 상한 평균", gapAvg.toFixed(1), "(기대", expectGapAvg.toFixed(1), ")");

const captured = washoutScoreSeries(
  [
    { t: rth(0), price: 140, high: 140 },
    { t: rth(90), price: 200, high: 200 },
  ],
  100
);
console.log(
  "포착→고점 세션분",
  captured[0].captureAt === captured[1].captureAt,
  captured[1].captureAt === rth(0),
  sessionMinutesBetween(captured[1].captureAt, captured[1].peakAt).toFixed(0),
  "(기대 true true 90)"
);

const sparse = washoutScoreSeries(
  [
    { t: rth(0), price: 140, high: 140 },
    { t: rth(200), price: 110, high: 110 },
  ],
  100
);
console.log(
  "체결 드문 경과",
  sparse[1].sessionElapsedMin.toFixed(0),
  sparse[1].tracking,
  "(기대 200 / true)"
);

const thinThenFat = washoutScoreSeries(
  [
    { t: rth(0), price: 0.51, high: 0.8, volume: 11_942, vwap: 0.5307 },
    { t: rth(1), price: 140, high: 140, volume: 200, vwap: 140 },
  ],
  0.474
);
console.log(
  "얇은 틱 건너뛰고 대금 있는 분 포착",
  thinThenFat[0].tracking,
  thinThenFat[1].tracking,
  "(기대 false / true)"
);
console.log(
  "12h 지난 빈 분은 지수에서 제외",
  stillTrackingAt(sparse[1], rth(200)),
  stillTrackingAt(sparse[1], rth(200) + 24 * 60 * 60 * 1000),
  "(기대 true / false)"
);

const specAhOpen = etWallMs("2026-09-08", 16, 0);
const specAhMid = etWallMs("2026-09-08", 18, 0);
const nextRthEnd = etWallMs("2026-09-09", 16, 0);
const specOpen = washoutScoreSeries(
  [{ t: specAhOpen, price: 140, high: 140 }],
  100,
  { specialAhYmds: ["2026-09-08"] }
);
const specMid = washoutScoreSeries(
  [{ t: specAhMid, price: 140, high: 140 }],
  100,
  { specialAhYmds: ["2026-09-08"] }
);
const specPlain = washoutScoreSeries([{ t: specAhOpen, price: 140, high: 140 }], 100);
const specPre = washoutScoreSeries(
  [{ t: etWallMs("2026-09-09", 5, 0), price: 140, high: 140 }],
  100,
  { specialAhYmds: ["2026-09-09"] }
);
console.log(
  "특별 앱장 16:00 한도",
  specOpen[0].sessionQuotaMin.toFixed(0),
  "(기대 960)"
);
console.log(
  "특별 앱장 18:00 한도",
  specMid[0].sessionQuotaMin.toFixed(0),
  "(기대 960)"
);
console.log("일반 앱장 한도", specPlain[0].sessionQuotaMin.toFixed(0), "(기대 960)");
console.log("특별이어도 프장 한도", specPre[0].sessionQuotaMin.toFixed(0), "(기대 960)");
console.log(
  "특별 앱장 포착은 다음날 본장 끝까지",
  stillTrackingAt(specOpen[0], nextRthEnd - 60_000),
  stillTrackingAt(specOpen[0], nextRthEnd),
  "(기대 false / false, 본장 종료 후 이어지지 않음)"
);

const specSet = specialTickersAfterRth([
  { ticker: "AAA", high: 10, close: 1.1, prevClose: 1 },
  { ticker: "BBB", high: 2, close: 3, prevClose: 1 },
  { ticker: "CCC", high: 1.1, close: 1.05, prevClose: 1 },
]);
console.log(
  "특별종목 900%와 종가1위",
  specSet.has("AAA"),
  specSet.has("BBB"),
  specSet.has("CCC"),
  "(기대 true true false)"
);

console.log(
  "본장 5분 공백 서킷",
  isRthCircuitResume(rth(1), rth(6)),
  isRthCircuitResume(rth(1), rth(2)),
  "(기대 true / false)"
);
const haltDump = washoutScoreSeries(
  [
    { t: rth(0), price: 140, open: 140, high: 140 },
    { t: rth(1), price: 120, open: 140, high: 140 },
    { t: rth(6), price: 70, open: 80, high: 80 },
  ],
  100
);
console.log(
  "서킷 재개 시작=직전종가",
  haltDump[2].ddPct.toFixed(1),
  haltDump[2].score.toFixed(0),
  haltDump[1].score.toFixed(0),
  "(기대 dd50, 재개 점수 > 직전 분 점수)"
);

const ah0 = etWallMs("2026-05-11", 16, 0);
const ah2h = etWallMs("2026-05-11", 18, 0);
const preEarly = etWallMs("2026-05-12", 4, 5);
const prePeak = etWallMs("2026-05-12", 7, 5);
const preLate = etWallMs("2026-05-12", 4, 40);
const bridged = washoutScoreSeries(
  [
    { t: ah0, price: 140, high: 140 },
    { t: ah2h, price: 140, high: 140 },
    { t: preEarly, price: 150, high: 150 },
    { t: prePeak, price: 200, high: 200 },
  ],
  100
);
console.log(
  "30분 안 재포착 추적시작 유지",
  bridged[2].captureAt === ah0,
  bridged[2].sessionCaptureAt === preEarly,
  bridged[3].peakPrice,
  bridged[3].peakElapsedMin?.toFixed(0),
  "(기대 true true 200, 경과 ~5h)"
);
const lateRecap = washoutScoreSeries(
  [
    { t: ah0, price: 140, high: 140 },
    { t: ah2h, price: 140, high: 140 },
    { t: preLate, price: 150, high: 150 },
  ],
  100
);
console.log(
  "30분 지나 재포착은 새 추적시작",
  lateRecap[2].captureAt === preLate,
  lateRecap[2].tracking,
  "(기대 true true)"
);
const rthOpen = etWallMs("2026-05-12", 9, 31);
const preOnly = washoutScoreSeries(
  [
    { t: ah0, price: 140, high: 140 },
    { t: preEarly, price: 110, high: 110 },
  ],
  100
);
const mixedIdx = washoutIndexPathDetailed([
  { ticker: "AH", series: washoutScoreSeries([{ t: ah0, price: 140, high: 140 }], 100) },
  { ticker: "PRE", series: washoutScoreSeries([{ t: preEarly, price: 140, high: 140 }], 100) },
]);
const preMinute = mixedIdx.filter((row) => row.t === preEarly);
console.log(
  "프장 평균은 프장 포착만",
  preMinute[0]?.members.map((m) => m.ticker).join(",") || "none",
  preOnly[1].tracking,
  "(기대 PRE, 애프터종목은 프장 +10%면 미추적)"
);
void intervalGapWeightFromTimes;
void rthOpen;

const reactionOpen = etWallMs("2026-05-12", 9, 31);
const reactionLater = reactionOpen + WASHOUT_REACTION_MS;
const reactionAfter = reactionLater + 60_000;
const preBridge = etWallMs("2026-05-12", 9, 0);
function reactionPoint(
  t: number,
  captureAt: number,
  sessionCaptureAt: number,
  score: number
) {
  return {
    t,
    price: 10,
    peakPrice: 12,
    peakAt: sessionCaptureAt,
    captureAt,
    sessionCaptureAt,
    ddPct: 10,
    minuteChange: 0,
    minuteScore: 0,
    score,
    tracking: true,
    sessionElapsedMin: 1,
    sessionQuotaMin: 960,
    trackUntilMs: reactionAfter + 60 * 60 * 1000,
  };
}
const reactionPath = washoutReactionIndexPath([
  [reactionPoint(reactionOpen, reactionOpen, reactionOpen, 100)],
  [
    reactionPoint(reactionOpen, preBridge, reactionOpen, 40),
    reactionPoint(reactionLater, preBridge, reactionOpen, 40),
    reactionPoint(reactionAfter, preBridge, reactionOpen, 40),
  ],
]);
const atOpen = reactionPath.find((row) => row.t === reactionOpen);
const atLimit = reactionPath.find((row) => row.t === reactionLater);
const atAfter = reactionPath.find((row) => row.t === reactionAfter);
if (!atOpen || atOpen.score <= 0) throw new Error("reaction open should include the fresh name");
if (!atLimit || atLimit.score <= 0) throw new Error("reaction should keep a name through 90 minutes");
if (!atAfter || atAfter.score !== 0) throw new Error("reaction should drop a name after 90 minutes");
console.log("현재반응 90분", atOpen.score > 0, atLimit.score > 0, atAfter.score === 0);

const endPremarket = etWallMs("2026-10-08", 9, 29);
const endRegular = etWallMs("2026-10-08", 15, 59);
const endAfter = etWallMs("2026-10-07", 19, 59);
if (!isSessionEndMinute(endPremarket) || !isSessionEndMinute(endRegular) || !isSessionEndMinute(endAfter)) {
  throw new Error("session end minute");
}
if (isSessionEndMinute(endPremarket - 60_000) || isSessionEndMinute(endPremarket + 60_000)) {
  throw new Error("only the last minute of a session is held");
}
const held = holdSessionEndMinute([
  { t: endPremarket - 60_000, v: 752, reaction: 80 },
  { t: endPremarket, v: 199, reaction: 10 },
  { t: endRegular - 60_000, v: 464 },
  { t: endRegular, v: 12 },
]);
if (held[1].v !== 752 || held[1].reaction !== 80 || held[3].v !== 464) {
  throw new Error("session end should keep the previous minute");
}
console.log("세션 마지막 분", held[1].v, held[3].v);
