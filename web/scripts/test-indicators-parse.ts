import {
  parseBlsReleaseHtml,
  parseFromFirstParagraph,
  parseFromKeywordAnchor,
  parseFromTableA,
} from "../lib/indicators/bls-parse";
import { compareActualForecast } from "../lib/indicators/types";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

/** Fixture with food/energy noise + headline lead + Table A */
const fixtureCpi = `
<html><body>
<p>Skip to content</p>
<p>The Consumer Price Index for All Urban Consumers (CPI-U) decreased 0.4 percent on a seasonally adjusted basis in June after rising 0.5 percent in May. Over the last 12 months, the all items index increased 3.5 percent before seasonal adjustment.</p>
<p>The food index increased 0.2 percent over the month. The energy index decreased 5.7 percent. The index for all items less food and energy was unchanged in June.</p>
<p>Table A. Percent changes in CPI for All Urban Consumers (CPI-U): U.S. city average</p>
<table>
  <tr><th></th><th>Dec</th><th>Jan</th><th>Feb</th><th>Mar</th><th>Apr</th><th>May</th><th>Jun</th><th>12-mos</th></tr>
  <tr><th>All items</th><td>0.3</td><td>0.2</td><td>0.3</td><td>0.9</td><td>0.6</td><td>0.5</td><td>-0.4</td><td>3.5</td></tr>
  <tr><th>Food</th><td>0.7</td><td>0.2</td><td>0.4</td><td>0.0</td><td>0.5</td><td>0.2</td><td>0.2</td><td>3.0</td></tr>
  <tr><th>Energy</th><td>0.3</td><td>-1.5</td><td>0.6</td><td>10.9</td><td>3.8</td><td>3.9</td><td>-5.7</td><td>15.7</td></tr>
  <tr><th>All items less food and energy</th><td>0.2</td><td>0.3</td><td>0.2</td><td>0.2</td><td>0.4</td><td>0.2</td><td>0.0</td><td>2.6</td></tr>
</table>
</body></html>
`;

const fixturePpi = `
<html><body>
<p>The Producer Price Index for final demand increased 0.3 percent in July, seasonally adjusted. Final demand goods less foods and energy rose 0.1 percent.</p>
<table>
  <caption>Table A. Monthly and 12-month percent changes</caption>
  <tr><th>Final demand</th><td>0.1</td><td>0.2</td><td>0.3</td><td>2.4</td></tr>
  <tr><th>Final demand goods</th><td>0.4</td><td>-0.1</td><td>0.5</td><td>1.1</td></tr>
</table>
</body></html>
`;

const tableOnly = parseFromTableA(fixtureCpi, "CPI");
assert(tableOnly?.ok && tableOnly.actual === -0.4, `table A mom want -0.4 got ${JSON.stringify(tableOnly)}`);
assert(tableOnly?.ok && tableOnly.yoy === 3.5, `table A yoy want 3.5`);

const paraOnly = parseFromFirstParagraph(fixtureCpi, "CPI");
assert(paraOnly?.ok && paraOnly.actual === -0.4, `first p want -0.4 got ${JSON.stringify(paraOnly)}`);

// Food noise must not win when using full parser (Table A first)
const full = parseBlsReleaseHtml(fixtureCpi, "CPI");
assert(full.ok && full.actual === -0.4 && full.method === "table_a", `full CPI ${JSON.stringify(full)}`);

const ppi = parseBlsReleaseHtml(fixturePpi, "PPI");
assert(ppi.ok && ppi.actual === 0.3, `PPI ${JSON.stringify(ppi)}`);

// Keyword anchor should ignore "all items less food and energy" MoM noise if headline present
const noisy = `
<p>The index for food increased 9.9 percent. Energy decreased 8.8 percent.
The index for all items less food and energy increased 7.7 percent.
The Consumer Price Index for All Urban Consumers (CPI-U) increased 0.2 percent on a seasonally adjusted basis.</p>
`;
const anchor = parseFromKeywordAnchor(noisy, "CPI");
assert(anchor?.ok && anchor.actual === 0.2, `anchor want 0.2 got ${JSON.stringify(anchor)}`);

assert(compareActualForecast(3.2, 3.1) === "HIGHER", "HIGHER");
assert(compareActualForecast(2.9, 3.1) === "LOWER", "LOWER");
assert(compareActualForecast(3.1, 3.1) === "EQUAL", "EQUAL");

console.log("indicators headline parse OK");
