import { classifyExhibit99Dateline, findCityInText, hasPressRelease } from "./newswire-dateline";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const cities = new Set([
  "NEW YORK",
  "TORONTO",
  "LONDON",
  "SAN FRANCISCO",
  "TEL AVIV",
  "YORK",
]);

const gnw = `Press Release\nNEW YORK, Aug. 31, 2026 (GLOBE NEWSWIRE) -- Example Corp today announced a contract.`;
const bw = `PRESS RELEASE\nSan Francisco--(BUSINESS WIRE)--Example Inc. priced an offering.`;
const headerOnly = `EX-99.1 Exhibit 99.1 Press Release RedHill Divests Talicia to Apotex for $18 Million Cash.`;
const secOnly = `UNITED STATES SECURITIES AND EXCHANGE COMMISSION Washington, D.C. Form 6-K. Exhibit 99.1 is furnished herewith.`;
const wireNoPress = `(GLOBE NEWSWIRE) -- A filing exhibit with no PR heading.`;

assert(hasPressRelease(headerOnly), "headerOnly should match press release");
assert(!hasPressRelease(secOnly), "secOnly should not match press release");

const a = classifyExhibit99Dateline(gnw, cities);
assert(a.isNewswire && a.newswire === "GlobeNewswire", `gnw: ${JSON.stringify(a)}`);

const b = classifyExhibit99Dateline(bw, cities);
assert(b.isNewswire && b.newswire === "Business Wire", `bw: ${JSON.stringify(b)}`);

const c = classifyExhibit99Dateline(secOnly, cities);
assert(!c.isNewswire, `secOnly should not be news: ${JSON.stringify(c)}`);

const d = classifyExhibit99Dateline(wireNoPress, cities);
assert(!d.isNewswire, `wireNoPress: ${JSON.stringify(d)}`);

const e = classifyExhibit99Dateline(headerOnly, cities);
assert(e.isNewswire && e.newswire == null, `headerOnly: ${JSON.stringify(e)}`);

const longest = findCityInText("NEW YORK, N.Y.", cities);
assert(longest === "NEW YORK", `longest city ${longest}`);

console.log("newswire-dateline.selftest ok");
