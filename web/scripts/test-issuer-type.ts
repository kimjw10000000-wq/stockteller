import { classifyIssuerType } from "../lib/companies/issuer-type";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const aapl = classifyIssuerType({
  name: "Apple Inc.",
  stateOfIncorporation: "CA",
  stateOfIncorporationDescription: "CA",
  addresses: {
    business: { stateOrCountry: "CA", isForeignLocation: null, country: null },
  },
  filings: { recent: { form: ["10-Q", "8-K", "10-K"] } },
});
assert(aapl.issuerType === "DOMESTIC", `AAPL ${JSON.stringify(aapl)}`);

const illinois = classifyIssuerType({
  name: "Illinois Co",
  stateOfIncorporation: "IL",
  addresses: { business: { stateOrCountry: "IL" } },
});
assert(illinois.issuerType === "DOMESTIC", "IL is Illinois (SEC), not Israel");

const kentucky = classifyIssuerType({
  name: "Kentucky Co",
  stateOfIncorporation: "KY",
});
assert(kentucky.issuerType === "DOMESTIC", "KY is Kentucky (SEC), not Cayman");

const baba = classifyIssuerType({
  name: "Alibaba Group Holding Ltd",
  stateOfIncorporation: "K3",
  stateOfIncorporationDescription: "Hong Kong",
  addresses: {
    business: { isForeignLocation: 1, country: "Hong Kong", countryCode: "K3" },
  },
  filings: { recent: { form: ["6-K", "20-F"] } },
});
assert(baba.issuerType === "FOREIGN", `BABA ${JSON.stringify(baba)}`);

const tsm = classifyIssuerType({
  name: "TAIWAN SEMICONDUCTOR MANUFACTURING CO LTD",
  stateOfIncorporation: "",
  addresses: {
    business: { isForeignLocation: 1, country: "Taiwan", countryCode: "F5" },
  },
  filings: { recent: { form: ["6-K", "20-F"] } },
});
assert(tsm.issuerType === "FOREIGN", `TSM ${JSON.stringify(tsm)}`);

const nvo = classifyIssuerType({
  name: "NOVO NORDISK A S",
  stateOfIncorporation: "",
  addresses: {
    business: { stateOrCountry: "G7", stateOrCountryDescription: "Denmark" },
  },
  filings: { recent: { form: ["6-K", "20-F", "F-6"] } },
});
assert(nvo.issuerType === "FOREIGN", `NVO ${JSON.stringify(nvo)}`);

const adr = classifyIssuerType({
  name: "Foo ADR",
  isAdr: true,
  stateOfIncorporation: "DE",
});
assert(adr.issuerType === "FOREIGN", "isAdr overrides DE");

console.log("issuer-type classify OK");
