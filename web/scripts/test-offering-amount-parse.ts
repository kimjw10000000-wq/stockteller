import {
  isActiveEffectDate,
  isRegistrationFormType,
  isSizedRegistrationForm,
  isWksiAsrForm,
  normalizeSecFileNumber,
  parseCoverOfferingAmount,
  parseEffectXml,
  parseOfferingAmountFromDocuments,
  parsePriorRegistrationNumbers,
  parseUsdToken,
} from "../lib/sec/offering-amount-parse";
import { applyShelfRollover, sumActiveShelfCapacity } from "../lib/sec/shelf-rollover";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(parseUsdToken("$1,250,000.50") === 1250000.5, "usd token");
assert(isRegistrationFormType("S-3"), "S-3");
assert(isRegistrationFormType("S-3ASR"), "S-3ASR");
assert(isRegistrationFormType("S-3/A"), "S-3/A");
assert(isRegistrationFormType("F-1MEF"), "F-1MEF");
assert(isRegistrationFormType("POS AM"), "POS AM");
assert(!isRegistrationFormType("S-8"), "not S-8");
assert(!isRegistrationFormType("8-K"), "not 8-K");

assert(isWksiAsrForm("S-3ASR", "DOMESTIC"), "domestic WKSI");
assert(!isWksiAsrForm("F-3ASR", "DOMESTIC"), "domestic ignores F-3ASR");
assert(isWksiAsrForm("F-3ASR", "FOREIGN"), "foreign WKSI");
assert(!isWksiAsrForm("S-3ASR", "FOREIGN"), "foreign ignores S-3ASR");

assert(isSizedRegistrationForm("S-3", "DOMESTIC"), "domestic S-3");
assert(isSizedRegistrationForm("S-1/A", "DOMESTIC"), "domestic S-1/A");
assert(isSizedRegistrationForm("POS AM", "DOMESTIC"), "domestic POS AM");
assert(!isSizedRegistrationForm("S-3ASR", "DOMESTIC"), "domestic ASR not sized");
assert(!isSizedRegistrationForm("F-3", "DOMESTIC"), "domestic skips F-3");
assert(isSizedRegistrationForm("F-3", "FOREIGN"), "foreign F-3");
assert(isSizedRegistrationForm("F-1", "FOREIGN"), "foreign F-1");
assert(!isSizedRegistrationForm("S-3", "FOREIGN"), "foreign skips S-3");
assert(!isSizedRegistrationForm("F-3ASR", "FOREIGN"), "foreign ASR not sized");

const effect = parseEffectXml(`
<edgarSubmission>
  <effectiveData>
    <finalEffectivenessDispDate>2026-04-10</finalEffectivenessDispDate>
    <form>S-3</form>
    <filer><fileNumber>333-294669</fileNumber></filer>
  </effectiveData>
</edgarSubmission>
`);
assert(effect.form === "S-3", "effect form");
assert(effect.fileNumber === "333-294669", "effect file");
assert(effect.effectDate === "2026-04-10", "effect date");
assert(isActiveEffectDate("2026-04-10", Date.parse("2026-08-14T00:00:00Z")), "active");
assert(!isActiveEffectDate("2020-01-01", Date.parse("2026-08-14T00:00:00Z")), "expired");

const asOf = Date.parse("2026-08-14T12:00:00Z");
assert(isActiveEffectDate("2023-08-14", asOf), "3y anniversary still active");
assert(!isActiveEffectDate("2023-08-14", Date.parse("2026-08-15T00:00:00Z")), "day after 3y expired");
assert(isActiveEffectDate("2023-08-15", asOf), "expires tomorrow still active");
assert(!isActiveEffectDate("2023-08-13", asOf), "expired yesterday");

const cover = parseCoverOfferingAmount(
  "The registrant may offer and sell up to $250,000,000 of its securities. Other text."
);
assert(cover === 250000000, `cover ${cover}`);
assert(
  parseCoverOfferingAmount("Maximum Aggregate Offering Price: $75,000,000") === 75000000,
  "cover MAOP"
);
assert(
  parseCoverOfferingAmount(
    "The registrant may sell an aggregate offering price of up to $12,500,000 of securities."
  ) === 12500000,
  "cover aggregate up to"
);
assert(
  parseCoverOfferingAmount("up to $15.00 per share of common stock") == null,
  "skip per-share"
);

assert(
  parseOfferingAmountFromDocuments({
    feeXmlOrHtml: `<xbrl>
    <ffd:OfferingAggtAmt unitRef="USD" decimals="0">10000000</ffd:OfferingAggtAmt>
    <ffd:OfferingAggtAmt unitRef="USD" decimals="0">20000000</ffd:OfferingAggtAmt>
    <ffd:FeeAmt unitRef="USD" decimals="2">11092.50</ffd:FeeAmt>
  </xbrl>`,
  }) == null,
  "line items only → null"
);

const xbrl = parseOfferingAmountFromDocuments({
  feeXmlOrHtml: `<xbrl>
    <ffd:OfferingAggtAmt unitRef="USD" decimals="0">10000000</ffd:OfferingAggtAmt>
    <ffd:FeeTableTotalOfferingAmount unitRef="USD" decimals="0">75000000</ffd:FeeTableTotalOfferingAmount>
  </xbrl>`,
});
assert(xbrl?.amount === 75000000 && xbrl.method === "fee_xbrl", `xbrl total ${JSON.stringify(xbrl)}`);

const table = parseOfferingAmountFromDocuments({
  feeXmlOrHtml: `
  <table>
    <tr><th></th><th>Proposed Maximum Aggregate Offering Price</th><th>Amount of Registration Fee</th></tr>
    <tr><td>Common Stock</td><td>$10,000,000</td><td>$1,474</td></tr>
    <tr><td>Warrants</td><td>$5,000,000</td><td>$737</td></tr>
    <tr><td>Total</td><td>$15,000,000</td><td>$2,211</td></tr>
  </table>
  <p>Calculation of Registration Fee</p>
  `,
});
assert(table?.amount === 15000000 && table.method === "fee_table", `table total ${JSON.stringify(table)}`);

assert(
  parseOfferingAmountFromDocuments({
    feeXmlOrHtml: `
  <table>
    <tr><th></th><th>Proposed Maximum Aggregate Offering Price</th></tr>
    <tr><td>Common Stock</td><td>$10,000,000</td></tr>
    <tr><td>Warrants</td><td>$5,000,000</td></tr>
  </table>
  <p>Calculation of Registration Fee</p>
  `,
  }) == null,
  "no Total row → null, do not sum"
);

const coverWins = parseOfferingAmountFromDocuments({
  primaryHtml: "<html><body>Prospectus. Up to $250,000,000 of securities.</body></html>",
  feeXmlOrHtml: `
  <table>
    <tr><th></th><th>Proposed Maximum Aggregate Offering Price</th></tr>
    <tr><td>Common Stock</td><td>$10,000,000</td></tr>
    <tr><td>Total</td><td>$10,000,000</td></tr>
  </table>`,
});
assert(coverWins?.amount === 250000000 && coverWins.method === "cover_regex", "cover first");

assert(normalizeSecFileNumber("File No. 333-294668") === "333-294668", "normalize file no");

const priorsXbrl = parsePriorRegistrationNumbers(
  `<ffd:CfwdPrrFileNb>333-111111</ffd:CfwdPrrFileNb>
   <ffd:OfferingAggtAmt>5000000000</ffd:OfferingAggtAmt>`,
  "333-222222"
);
assert(priorsXbrl.includes("333-111111"), `xbrl prior ${priorsXbrl}`);
assert(!priorsXbrl.includes("333-222222"), "exclude current file");

const priorsIx = parsePriorRegistrationNumbers(
  `<ix:nonNumeric name="ffd:CfwdPrrFileNb">333-290093</ix:nonNumeric>`
);
assert(priorsIx.includes("333-290093"), `ix prior ${priorsIx}`);

const priorsText = parsePriorRegistrationNumbers(
  "Unsold securities are carried forward under Rule 415(a)(6) from Registration Statement No. 333-250000. Prior Registration No. 333-250000."
);
assert(priorsText.includes("333-250000"), `text prior ${priorsText}`);

const rolled = applyShelfRollover([
  {
    cik: "0001111111",
    fileNumber: "333-111111",
    priorFileNumbers: [],
    isActive: true,
    status: "ACTIVE" as const,
    replacedByFileNumber: null,
    formType: "S-3",
    parseMethod: "fee_table",
    maxOfferingAmount: 5_000_000_000,
    effectDate: "2025-01-01",
  },
  {
    cik: "0001111111",
    fileNumber: "333-222222",
    priorFileNumbers: ["333-111111"],
    isActive: true,
    status: "ACTIVE" as const,
    replacedByFileNumber: null,
    formType: "S-3",
    parseMethod: "fee_table",
    maxOfferingAmount: 5_000_000_000,
    effectDate: "2026-01-01",
  },
  {
    cik: "0009999999",
    fileNumber: "333-111111",
    priorFileNumbers: [],
    isActive: true,
    status: "ACTIVE" as const,
    replacedByFileNumber: null,
    formType: "S-3",
    parseMethod: "fee_table",
    maxOfferingAmount: 1_000_000,
    effectDate: "2025-01-01",
  },
]);
const oldSame = rolled.find((r) => r.cik === "0001111111" && r.fileNumber === "333-111111");
const neu = rolled.find((r) => r.fileNumber === "333-222222");
const otherIssuer = rolled.find((r) => r.cik === "0009999999");
assert(oldSame?.status === "REPLACED" && oldSame.isActive === false, "prior retired");
assert(oldSame?.replacedByFileNumber === "333-222222", "replaced_by set");
assert(neu?.status === "ACTIVE" && neu.isActive === true, "successor stays active");
assert(otherIssuer?.status === "ACTIVE" && otherIssuer.isActive === true, "other CIK isolated");

const cap = sumActiveShelfCapacity(rolled, "0001111111", Date.parse("2026-08-14T00:00:00Z"));
assert(cap.isUnlimitedShelf === false && cap.total === 5_000_000_000, `no double count ${cap.total}`);
const otherCap = sumActiveShelfCapacity(rolled, "0009999999", Date.parse("2026-08-14T00:00:00Z"));
assert(otherCap.total === 1_000_000, `other CIK sum ${otherCap.total}`);

console.log("offering-amount-parse OK");
