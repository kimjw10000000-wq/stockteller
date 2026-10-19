import {
  buildExchangeListedUniverse,
  deactivateRemainingOrphanCiks,
  fillListingCiks,
  planUsListedDiff,
  resolveListedIssuerParent,
  findIssuerParentTicker,
  isPreferredShareTicker,
  isWarrantOrPreferredListing,
  type DbListingRow,
  type SecListingRow,
} from "./listing-diff";

function db(
  ticker: string,
  cik: string,
  extra?: Partial<DbListingRow>
): DbListingRow {
  return {
    ticker,
    name: ticker,
    cik,
    exchange: "NASDAQ",
    is_active: true,
    previous_tickers: [],
    ...extra,
  };
}

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const trader = [
  { ticker: "KEEP", name: "Keep Co", exchange: "NASDAQ" as const },
  { ticker: "NEW", name: "New Co", exchange: "NYSE" as const },
  { ticker: "RML", name: "RML", exchange: "NYSE" as const },
  { ticker: "ABR$D", name: "ABR Pref", exchange: "NYSE" as const },
  { ticker: "AAC-W", name: "AAC Warrant", exchange: "NYSE" as const },
];
const sec: SecListingRow[] = [
  { ticker: "KEEP", name: "Keep Co", cik: "0000000001", exchange: "NASDAQ" },
  { ticker: "KEEP-P", name: "Keep Pref", cik: "0000000001", exchange: "NYSE" },
  { ticker: "OLD", name: "Old Co", cik: "0000000002", exchange: "NYSE" },
  { ticker: "GONE", name: "Gone Co", cik: "0000000003", exchange: "NASDAQ" },
  { ticker: "ABR", name: "Arbor", cik: "0000000004", exchange: "NYSE" },
  { ticker: "AAC", name: "AAC Corp", cik: "0000000005", exchange: "NYSE" },
];
const polygon = new Map([
  ["NEW", { cik: "0000000099", name: "New Co Inc" }],
  ["RML", { cik: "0000000002", name: "Renamed" }],
]);

const uni = buildExchangeListedUniverse(trader, sec, polygon);
assert(uni.mapMatched === 1, `mapMatched ${uni.mapMatched}`);
assert(uni.aliasFilled === 2, `aliasFilled ${uni.aliasFilled}`);
assert(uni.polygonFilled === 2, `polygonFilled ${uni.polygonFilled}`);
assert(uni.listed.some((r) => r.ticker === "ABR$D" && r.cik === "0000000004"), "ABR$D alias cik");
assert(uni.listed.some((r) => r.ticker === "AAC-W" && r.cik === "0000000005"), "AAC-W alias cik");
assert(uni.listed.some((r) => r.ticker === "KEEP" && r.cik === "0000000001"), "KEEP cik");
assert(uni.listed.some((r) => r.ticker === "RML" && r.cik === "0000000002"), "RML reclaim");
assert(!uni.orphanCiksRemaining.includes("0000000002"), "reclaimed cik must leave orphan list");
assert(uni.orphanCiksRemaining.includes("0000000003"), "unmatched map cik stays orphan");

const rows = uni.listed;
const database = [db("KEEP", "0000000001"), db("OLD", "0000000002"), db("GONE", "0000000003")];
const plan = deactivateRemainingOrphanCiks(
  planUsListedDiff(rows, database),
  database,
  rows,
  uni.orphanCiksRemaining
);
assert(plan.renames.some((r) => r.from === "OLD" && r.to === "RML"), "OLD→RML rename");
assert(plan.inserts.some((r) => r.ticker === "NEW"), "NEW insert");
assert(plan.deactivates.includes("GONE"), "GONE deactivate");
assert(!plan.deactivates.includes("OLD"), "OLD renamed not deactivated");

assert(isPreferredShareTicker("DCOM$") === true, "DCOM$ preferred");
assert(
  resolveListedIssuerParent("DCOM$", [{ ticker: "DCOM", cik: "0000000006" }])?.cik === "0000000006",
  "trailing $ preferred inherits common cik"
);
assert(findIssuerParentTicker("DCOM$", ["DCOM", "DCOM$"]) === "DCOM", "DCOM$ waits on DCOM");
assert(isPreferredShareTicker("CMS-PB") === true, "CMS-PB preferred");
assert(isPreferredShareTicker("BRK-B") === false, "BRK-B is class B not preferred");
assert(isWarrantOrPreferredListing("AAC-W") === true, "dash warrant");
assert(isWarrantOrPreferredListing("LTRYW") === true, "nasdaq warrant");
assert(isWarrantOrPreferredListing("ABR$D") === true, "dollar preferred");
assert(isWarrantOrPreferredListing("HODO", "House of Doge Inc. - Common Stock") === false, "common stays");
assert(isWarrantOrPreferredListing("ACME", "Acme Warrant") === true, "warrant name");
assert(isWarrantOrPreferredListing("ACME", "아크미 워런트") === true, "korean warrant name");
assert(isWarrantOrPreferredListing("ACME", "아크미 우선주") === true, "korean preferred name");
assert(isWarrantOrPreferredListing("BRK-B", "Berkshire Hathaway Inc. Class B") === false, "class B stays");
assert(
  isWarrantOrPreferredListing("PFBC", "Preferred Bank - Common Stock") === false,
  "bank named Preferred stays"
);
assert(isWarrantOrPreferredListing("FLYW") === false, "four-letter common ending in W");
assert(
  resolveListedIssuerParent("ABR$D", [{ ticker: "ABR", cik: "0000000004" }])?.cik === "0000000004",
  "preferred inherits common cik"
);
assert(
  resolveListedIssuerParent("AAC-W", [{ ticker: "AAC", cik: "0000000005" }])?.ticker === "AAC",
  "warrant inherits common"
);
assert(
  resolveListedIssuerParent("ARBEW", [{ ticker: "ARBE", cik: "0001111111" }])?.cik === "0001111111",
  "nasdaq 5th letter warrant"
);
assert(
  resolveListedIssuerParent("NMPAR", [{ ticker: "NMP", cik: "0001222222" }])?.ticker === "NMP",
  "rights inherit short common"
);
assert(
  resolveListedIssuerParent("LTRYW", [
    { ticker: "SEGG", cik: "0001333333", previous_tickers: ["LTRY"] },
  ])?.ticker === "SEGG",
  "renamed common still owns old warrant"
);
assert(
  findIssuerParentTicker("ARBEW", ["ARBE", "ARBEW"]) === "ARBE",
  "same-day IPO warrant waits on common"
);
assert(findIssuerParentTicker("ARBE", ["ARBE", "ARBEW"]) == null, "common has no parent");

const split = planUsListedDiff(
  [
    { ticker: "NEW1", name: "Alpha Inc. - Common Stock", cik: "0000000088", exchange: "NASDAQ" },
    { ticker: "NEW2", name: "Alpha Inc. - Warrant", cik: "0000000088", exchange: "NASDAQ" },
  ],
  [
    db("OLD1", "0000000088", { name: "Alpha Inc. - Common Stock" }),
    db("OLD2", "0000000088", { name: "Alpha Class B" }),
  ]
);
assert(split.renames.some((row) => row.from === "OLD1" && row.to === "NEW1"), "unique common name renames");
assert(!split.renames.some((row) => row.from === "OLD2"), "unmatched class is not renamed");
assert(split.inserts.some((row) => row.ticker === "NEW2"), "warrant inserts beside the rename");
assert(split.deactivates.includes("OLD2"), "unmatched old ticker deactivates");

const ambiguous = planUsListedDiff(
  [
    { ticker: "B", name: "Beta Co", cik: "0000000077", exchange: "NASDAQ" },
    { ticker: "C", name: "Gamma Co", cik: "0000000077", exchange: "NASDAQ" },
  ],
  [db("A1", "0000000077", { name: "Old One" }), db("A2", "0000000077", { name: "Old Two" })]
);
assert(ambiguous.renames.length === 0, "ambiguous cik does not guess a rename");
assert(ambiguous.deactivates.includes("A1") && ambiguous.deactivates.includes("A2"), "old tickers deactivate");
assert(ambiguous.inserts.some((row) => row.ticker === "B") && ambiguous.inserts.some((row) => row.ticker === "C"), "new tickers insert");

const filled = fillListingCiks({
  skipped: [
    { ticker: "WORX", name: "SCWorx", exchange: "NASDAQ" },
    { ticker: "ARBEW", name: "Arbe Warrant", exchange: "NASDAQ" },
    { ticker: "IPO1", name: "Brand New Inc. - Common Stock", exchange: "NYSE" },
    { ticker: "DUP1", name: "Same Name Inc", exchange: "NASDAQ" },
    { ticker: "DUP2", name: "Same Name Inc", exchange: "NASDAQ" },
  ],
  listed: [{ ticker: "ARBE", name: "Arbe", cik: "0000000042", exchange: "NASDAQ" }],
  cikByTicker: new Map([["WORX", { cik: "0001674227", name: "SCWorx Corp." }]]),
  filings: [{ cik: "0000000091", companyName: "Brand New Inc." }],
  universeTickers: ["WORX", "ARBEW", "ARBE", "IPO1", "DUP1", "DUP2"],
});
assert(filled.added.some((row) => row.ticker === "WORX" && row.cik === "0001674227"), "sec ticker map fills cik");
assert(filled.added.some((row) => row.ticker === "ARBEW" && row.cik === "0000000042"), "warrant inherits the common cik");
assert(filled.added.some((row) => row.ticker === "IPO1" && row.cik === "0000000091"), "registration name fills cik");
assert(filled.skippedNoCik.includes("DUP1") && filled.skippedNoCik.includes("DUP2"), "duplicate names stay unresolved");

console.log("listing-diff.selftest ok", {
  listed: uni.listed.map((r) => r.ticker),
  orphans: uni.orphanCiksRemaining,
  inserts: plan.inserts.map((r) => r.ticker),
  deactivates: plan.deactivates,
  renames: plan.renames,
});
