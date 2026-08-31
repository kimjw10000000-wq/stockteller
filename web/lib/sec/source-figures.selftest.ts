import { applyFigureGlossary, extractSourceFigures, inventedManAmounts } from "./source-figures";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const money = extractSourceFigures("cash of $18 million and up to $35 million in milestones");
assert(
  money.some((f) => f.source.includes("$18 million") && f.display.startsWith("1,800만")),
  `18 million: ${JSON.stringify(money)}`
);
assert(
  money.some((f) => f.source.includes("$35 million") && f.display.startsWith("3,500만")),
  `35 million: ${JSON.stringify(money)}`
);

const small = extractSourceFigures("received $180,000 in cash");
assert(
  small.some((f) => f.display.includes("18만") && f.source.includes("$180,000")),
  `$180,000: ${JSON.stringify(small)}`
);

const ratio = extractSourceFigures("completed a 1-for-20 reverse split of its ordinary shares");
assert(
  ratio.some((f) => f.kind === "ratio" && f.display.includes("1대 20") && f.source.includes("1-for-20")),
  `ratio: ${JSON.stringify(ratio)}`
);

const colon = extractSourceFigures("the reverse split ratio will be 1:15 of the issued share capital");
assert(
  colon.some((f) => f.kind === "ratio" && f.source.includes("1:15")),
  `colon ratio: ${JSON.stringify(colon)}`
);

const clock = extractSourceFigures("the call starts at 14:00 Eastern time");
assert(
  !clock.some((f) => f.kind === "ratio"),
  `clock should not be a ratio: ${JSON.stringify(clock)}`
);

const localized = applyFigureGlossary("sold Talicia for $18 million in cash", money);
assert(localized.includes("1,800만") && localized.includes("$18 million"), localized);

const bad = inventedManAmounts("18만 달러 확보", money);
assert(bad.includes("18만"), `should flag 18만: ${JSON.stringify(bad)}`);

const ok = inventedManAmounts("1,800만 달러($18 million) 확보", money);
assert(ok.length === 0, `false positive: ${JSON.stringify(ok)}`);

console.log("source-figures.selftest ok");
