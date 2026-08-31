import { classifyExhibit99Dateline, findCityInText } from "./newswire-dateline";

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

const gnw = `NEW YORK, Aug. 31, 2026 (GLOBE NEWSWIRE) -- Example Corp today announced a contract.`;
const bw = `San Francisco--(BUSINESS WIRE)--Example Inc. priced an offering.`;
const secOnly = `UNITED STATES SECURITIES AND EXCHANGE COMMISSION Washington, D.C. Form 6-K. Exhibit 99.1 is furnished herewith.`;
const wireNoCity = `(GLOBE NEWSWIRE) -- A release with no city dateline.`;

const a = classifyExhibit99Dateline(gnw, cities);
assert(a.isNewswire && a.city === "NEW YORK" && a.newswire === "GlobeNewswire", `gnw: ${JSON.stringify(a)}`);

const b = classifyExhibit99Dateline(bw, cities);
assert(b.isNewswire && b.city === "SAN FRANCISCO" && b.newswire === "Business Wire", `bw: ${JSON.stringify(b)}`);

const c = classifyExhibit99Dateline(secOnly, cities);
assert(!c.isNewswire, `secOnly should not be news: ${JSON.stringify(c)}`);

const d = classifyExhibit99Dateline(wireNoCity, cities);
assert(!d.isNewswire, `wireNoCity: ${JSON.stringify(d)}`);

const longest = findCityInText("NEW YORK, N.Y.", cities);
assert(longest === "NEW YORK", `longest city ${longest}`);

console.log("newswire-dateline.selftest ok");
