import { parseBlsReleaseHtml } from "../lib/indicators/bls-parse";
import { compareActualForecast } from "../lib/indicators/types";

const sampleCpi = `
<html><body>
The Consumer Price Index for All Urban Consumers (CPI-U) increased 0.2 percent
on a seasonally adjusted basis over the month. Over the last 12 months, the
all items index increased 2.7 percent before seasonal adjustment.
</body></html>
`;

const samplePpi = `
<html><body>
The Producer Price Index for final demand increased 0.3 percent in July,
seasonally adjusted.
</body></html>
`;

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const cpi = parseBlsReleaseHtml(sampleCpi, "CPI");
assert(cpi.ok && cpi.actual === 0.2 && cpi.period === "mom", `CPI parse failed: ${JSON.stringify(cpi)}`);

const ppi = parseBlsReleaseHtml(samplePpi, "PPI");
assert(ppi.ok && ppi.actual === 0.3, `PPI parse failed: ${JSON.stringify(ppi)}`);

assert(compareActualForecast(3.2, 3.1) === "HIGHER", "HIGHER");
assert(compareActualForecast(2.9, 3.1) === "LOWER", "LOWER");
assert(compareActualForecast(3.1, 3.1) === "EQUAL", "EQUAL");
assert(compareActualForecast(null, 3.1) === "PENDING", "PENDING");

console.log("indicators parse/compare OK");
