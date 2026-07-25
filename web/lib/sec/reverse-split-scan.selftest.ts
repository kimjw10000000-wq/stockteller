/**
 * Quick assertions for reverse-split ratio parsing / 250:1 math / dedupe.
 * Run: npx tsx lib/sec/reverse-split-scan.selftest.ts
 */
import {
  computeLimitSummary,
  dedupeReverseSplitHits,
  extractReverseSplitRatio,
  type ReverseSplitHit,
} from "./reverse-split-scan";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function hit(
  partial: Pick<ReverseSplitHit, "filingDate" | "accessionNumber" | "ratioToOne"> &
    Partial<ReverseSplitHit>
): ReverseSplitHit {
  return {
    form: "8-K",
    ratioLabel: `1대 ${partial.ratioToOne}`,
    documentUrl: "",
    viewerUrl: "",
    isEffectiveExecution: false,
    counted: true,
    ...partial,
  };
}

// --- single-document: first match only ---
assert(extractReverseSplitRatio("Company announced a 1-for-20 reverse stock split.")?.ratioToOne === 20, "1-for-20");
assert(
  extractReverseSplitRatio(
    "Board approved a 1-for-10 reverse stock split. Later the same filing repeats 1-for-10 reverse stock split again and also mentions 1-for-50 reverse stock split."
  )?.ratioToOne === 10,
  "first-only ignores later 1-for-50"
);
assert(
  extractReverseSplitRatio("Effective Date of the 1 for 10 reverse split of the common stock")
    ?.isEffectiveExecution === true,
  "effective date flag"
);
assert(
  extractReverseSplitRatio("shares on a split-adjusted 1-for-20 reverse stock split basis")
    ?.isEffectiveExecution === true,
  "split-adjusted flag"
);
assert(extractReverseSplitRatio("exchange ratio of 1-for-5 in a merger") == null, "no reverse hint");

const none = computeLimitSummary([]);
assert(none.cumulativeRatio === 1 && none.remainingRatio === 250 && !none.blocked, "empty");

const one = computeLimitSummary([10]);
assert(one.cumulativeRatio === 10 && one.remainingRatio === 25 && !one.blocked, "10");

const two = computeLimitSummary([10, 20]);
assert(two.cumulativeRatio === 200 && two.remainingRatio === 1.25 && !two.blocked, "10*20");

const blocked = computeLimitSummary([10, 25]);
assert(blocked.cumulativeRatio === 250 && blocked.blocked, "250 blocked");
assert(blocked.statusMessage.includes("250대 1 한도 초과"), "blocked label");

// --- cross-document dedupe: same ratio within 45 days ---
const dup = dedupeReverseSplitHits([
  hit({
    filingDate: "2026-01-01",
    accessionNumber: "0001",
    ratioToOne: 20,
    isEffectiveExecution: false,
  }),
  hit({
    filingDate: "2026-01-30",
    accessionNumber: "0002",
    ratioToOne: 20,
    isEffectiveExecution: true,
  }),
  hit({
    filingDate: "2026-06-01",
    accessionNumber: "0003",
    ratioToOne: 10,
    isEffectiveExecution: false,
  }),
]);
assert(dup.counted.length === 2, "2 unique events");
assert(dup.excluded.length === 1, "1 duplicate excluded");
assert(dup.counted.find((h) => h.ratioToOne === 20)?.accessionNumber === "0002", "prefer effective");
assert(dup.excluded[0]?.excludeReason === "중복 안건 제외됨", "exclude reason");

// far apart same ratio → two events
const far = dedupeReverseSplitHits([
  hit({ filingDate: "2025-01-01", accessionNumber: "a", ratioToOne: 5 }),
  hit({ filingDate: "2025-06-01", accessionNumber: "b", ratioToOne: 5 }),
]);
assert(far.counted.length === 2 && far.excluded.length === 0, "60d apart = separate");

console.log("reverse-split-scan.selftest OK");
