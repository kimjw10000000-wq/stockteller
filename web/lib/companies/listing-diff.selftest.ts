import {
  buildExchangeListedUniverse,
  deactivateRemainingOrphanCiks,
  planUsListedDiff,
  resolveListedIssuerParent,
  findIssuerParentTicker,
  isPreferredShareTicker,
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

assert(isPreferredShareTicker("ABR$D") === true, "ABR$D preferred");
assert(isPreferredShareTicker("CMS-PB") === true, "CMS-PB preferred");
assert(isPreferredShareTicker("BRK-B") === false, "BRK-B is class B not preferred");
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

console.log("listing-diff.selftest ok", {
  listed: uni.listed.map((r) => r.ticker),
  orphans: uni.orphanCiksRemaining,
  inserts: plan.inserts.map((r) => r.ticker),
  deactivates: plan.deactivates,
  renames: plan.renames,
});
