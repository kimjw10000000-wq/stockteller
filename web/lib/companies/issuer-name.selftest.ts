import { issuerNameKey, issuerNamesEqual } from "./issuer-name";
import { matchIssuerNameTo12b, type Edgar12bHit } from "./edgar-12b-index";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(
  issuerNameKey("Atlas Trinity Technology, Inc. - Common Stock") ===
    issuerNameKey("Atlas Trinity Technology Inc"),
  "nasdaq suffix vs edgar legal name"
);
assert(
  issuerNamesEqual("Resolution Minerals Ltd (RML) (CIK 0002102907)", "Resolution Minerals Ltd"),
  "efts display name"
);
assert(!issuerNamesEqual("Apple Inc.", "Microsoft Corporation"), "different issuers");

const filings: Edgar12bHit[] = [
  { cik: "0000000002", companyName: "Older Co", form: "8-A12B", filed: "20260901" },
  { cik: "0000000001", companyName: "New Co, Inc.", form: "8-A12B", filed: "20260910" },
];
const hit = matchIssuerNameTo12b("New Co, Inc. - Common Stock", filings);
assert(hit?.cik === "0000000001", "newest matching name wins by list order");
assert(matchIssuerNameTo12b("Missing Corp", filings) == null, "no match");

console.log("issuer-name.selftest ok");
