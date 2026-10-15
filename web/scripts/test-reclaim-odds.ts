/**
 *   npx tsx scripts/test-reclaim-odds.ts
 */
import { liftProbability, oddsReferenceClose, quoteReclaim, recoveryX, showOddsPct } from "../lib/us-market/reclaim-odds";

function assert(cond: boolean, message: string): void {
  if (!cond) throw new Error(message);
}

const atLow = liftProbability(51.7766, 0);
assert(Math.abs(atLow - 51.7766) < 1e-6, `at low ${atLow}`);
const mid = liftProbability(51.7766, 50);
assert(Math.abs(mid - 71.96) < 0.05, `mid ${mid}`);
assert(liftProbability(51.7766, 100) === 100, "at high");
assert(showOddsPct(0) === 0.1, "zero floor");
assert(liftProbability(0, 0) === 0.1, "zero base");
assert(Math.abs(recoveryX(10, 7.8, 8.9) - 50) < 1e-9, `x ${recoveryX(10, 7.8, 8.9)}`);

const dipped = quoteReclaim({ prevClose: 1, peak: 3.22, low: 2.5116, price: 2.8658 });
assert(dipped != null && dipped.nextEdge === 250, `edge ${dipped?.nextEdge}`);
assert(dipped != null && Math.abs(dipped.reclaimPct - mid) < 0.2, `live reclaim ${dipped?.reclaimPct}`);
const atHigh = quoteReclaim({ prevClose: 1, peak: 2.56, low: 2.56, price: 2.56 });
assert(atHigh != null && atHigh.nextEdge === 200 && atHigh.reclaimPct === 100, `touch ${JSON.stringify(atHigh)}`);
const top = quoteReclaim({ prevClose: 1, peak: 12, low: 10, price: 10 });
assert(top != null && top.nextEdge == null && top.nextPct === 0.1, `top ${JSON.stringify(top)}`);

const iamOpen = oddsReferenceClose({ prevClose: 8.86, prevNotional: 8.86 * 4904, dayOpen: 16.15 });
assert(iamOpen === 16.15, `iam open ${iamOpen}`);
assert(quoteReclaim({ prevClose: iamOpen, peak: 19.7, low: 16.15, price: 19.09 }) == null, "iam under 30");
const busy = oddsReferenceClose({ prevClose: 10, prevNotional: 2_000_000, dayOpen: 16 });
assert(busy === 10, `busy day ${busy}`);
const near = oddsReferenceClose({ prevClose: 10, prevNotional: 50_000, dayOpen: 11 });
assert(near === 10, `near open ${near}`);

console.log("reclaim odds ok", { atLow, mid, dipped });
