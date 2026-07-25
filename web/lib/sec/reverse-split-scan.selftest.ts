/**
 * Quick assertions for reverse-split ratio parsing / 250:1 math.
 * Run: npx tsx lib/sec/reverse-split-scan.selftest.ts
 */
import { computeLimitSummary, extractReverseSplitRatio } from "./reverse-split-scan";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(extractReverseSplitRatio("Company announced a 1-for-20 reverse stock split.") === 20, "1-for-20");
assert(
  extractReverseSplitRatio("effective 1 for 10 reverse split of the common stock") === 10,
  "1 for 10"
);
assert(
  extractReverseSplitRatio("The Board approved a one-for-250 reverse stock split.") === 250,
  "one-for-250"
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

const over = computeLimitSummary([20, 20]);
assert(over.blocked && (over.remainingRatio ?? 0) < 1, "400 blocked");

console.log("reverse-split-scan.selftest OK");
