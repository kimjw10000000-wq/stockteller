import {
  extractDatesFromBidPriceParagraph,
  isForeignBidPriceParagraph,
  isUsBidPriceParagraph,
  parseBidPriceDatesFromHtml,
  sixKMetaLooksRelevant,
  splitParagraphs,
} from "../lib/sec/bid-price-paragraph-parse";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const multi = `Item 3.01 Notice of Delisting or Failure to Satisfy a Continued Listing Rule or Standard.

On June 1, 2026, the Company received a letter from Nasdaq notifying the Company that it is not in compliance with the minimum bid price requirement set forth in Nasdaq Listing Rule 5550(a)(2). The Company has 180 calendar days, or until November 28, 2026, to regain compliance.

Separately, the Company received notice that it does not meet the audit committee requirement. The Company has until July 15, 2026 to regain compliance with the audit committee rule.

The Company also is not in compliance with the stockholders' equity requirement of $2,500,000. Nasdaq has provided until August 1, 2026 to submit a plan.`;

const html = `<html><body>
<p>Item 3.01 Notice of Delisting</p>
<p>On June 1, 2026, the Company received a letter from Nasdaq notifying the Company that it is not in compliance with the minimum bid price requirement set forth in Nasdaq Listing Rule 5550(a)(2). The Company has 180 calendar days, or until November 28, 2026, to regain compliance.</p>
<p>Separately, the Company received notice that it does not meet the audit committee requirement. The Company has until July 15, 2026 to regain compliance with the audit committee rule.</p>
</body></html>`;

const paras = splitParagraphs(multi);
assert(paras.some(isUsBidPriceParagraph), "us paragraph");
assert(
  paras.filter(isUsBidPriceParagraph).every((p) => /5550|minimum bid|\$1\.00/i.test(p)),
  "only bid-price paras"
);

const us = parseBidPriceDatesFromHtml(html, "us-8k");
assert(us?.noticeDate === "2026-06-01", `notice ${us?.noticeDate}`);
assert(us?.deadlineDate === "2026-11-28", `deadline ${us?.deadlineDate}`);
assert(us?.storedDate === "2026-11-28" && us.storedKind === "deadline", "prefer deadline");

const noticeOnly = extractDatesFromBidPriceParagraph(
  "On May 15, 2026, the Company received a notification of noncompliance with the minimum bid price requirement of Rule 5550(a)(2)."
);
assert(noticeOnly.noticeDate === "2026-05-15", "notice only");
assert(noticeOnly.deadlineDate == null && noticeOnly.storedKind === "notice", "store notice");
assert(noticeOnly.storedDate === "2026-05-15", "stored notice");

const foreign = parseBidPriceDatesFromHtml(
  `<p>The Company received a notice from The Nasdaq Stock Market on March 3, 2026 that the Company’s closing bid price has been below $1.00. The Company has until September 1, 2026 to regain compliance.</p>
   <p>Q1 revenue was $12 million through June 30, 2026.</p>`,
  "foreign-6k"
);
assert(foreign?.noticeDate === "2026-03-03", `foreign notice ${foreign?.noticeDate}`);
assert(foreign?.deadlineDate === "2026-09-01", `foreign deadline ${foreign?.deadlineDate}`);
assert(foreign?.storedDate === "2026-09-01", "foreign store deadline");
assert(
  !isForeignBidPriceParagraph("Q1 revenue was $12 million through June 30, 2026."),
  "skip earnings para"
);

assert(sixKMetaLooksRelevant("EX-99.1 Nasdaq Deficiency Notice"), "meta hit");
assert(!sixKMetaLooksRelevant("Q2 Earnings Release"), "meta skip earnings");

console.log("test-bid-price-paragraph-parse: ok");
