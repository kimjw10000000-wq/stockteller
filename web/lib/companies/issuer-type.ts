/**
 * Classify US-listed issuers as DOMESTIC vs FOREIGN using SEC submissions
 * metadata only (no 10-K body parsing).
 *
 * Source: https://data.sec.gov/submissions/CIK{cik}.json
 *
 * SEC stateOfIncorporation uses EDGAR state/country codes, not ISO:
 *   IL = Illinois (US), KY = Kentucky (US), Israel ≈ L3, Cayman ≈ E9.
 */

import { secHeaders } from "@/lib/sec/edgar-client";

export type IssuerType = "DOMESTIC" | "FOREIGN";

export type SecAddress = {
  stateOrCountry?: string | null;
  stateOrCountryDescription?: string | null;
  isForeignLocation?: number | boolean | null;
  country?: string | null;
  countryCode?: string | null;
};

export type SecSubmissionsMeta = {
  name?: string | null;
  stateOfIncorporation?: string | null;
  stateOfIncorporationDescription?: string | null;
  isAdr?: boolean | null;
  addresses?: {
    mailing?: SecAddress | null;
    business?: SecAddress | null;
  } | null;
  filings?: {
    recent?: {
      form?: string[] | null;
    } | null;
  } | null;
};

export type IssuerTypeResult = {
  issuerType: IssuerType | null;
  reason: string;
};

/** US states + DC + territories. SEC uses these for domestic incorporation. */
export const US_JURISDICTION_CODES = new Set([
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "DC",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "PR",
  "GU",
  "VI",
  "AS",
  "MP",
  "US",
  "USA",
  "X1",
]);

const FOREIGN_ANNUAL_FORM = /^(20-F|40-F)(\/A)?$/i;
const ADR_FORM = /^(F-6)(\s|$|EF|POS)/i;
const US_ANNUAL_FORM = /^(10-K|10-Q)(\/A)?$/i;

function norm(raw: string | null | undefined): string {
  return (raw ?? "").trim().toUpperCase();
}

function isTruthyFlag(v: unknown): boolean {
  return v === true || v === 1 || v === "1" || v === "true";
}

function classifyCodeOrDesc(raw: string | null | undefined): IssuerType | null {
  const original = (raw ?? "").trim();
  if (!original) return null;
  const code = norm(original);
  if (US_JURISDICTION_CODES.has(code)) return "DOMESTIC";
  if (/^UNITED STATES\b|^U\.?S\.?A?\.?$/i.test(original)) return "DOMESTIC";
  return "FOREIGN";
}

function classifyAddress(addr: SecAddress | null | undefined): IssuerType | null {
  if (!addr) return null;
  if (isTruthyFlag(addr.isForeignLocation)) return "FOREIGN";
  const country = (addr.country ?? "").trim();
  if (country && !/^united states\b|^u\.?s\.?a?\.?$/i.test(country)) return "FOREIGN";
  const countryCode = norm(addr.countryCode);
  if (countryCode && countryCode !== "US" && countryCode !== "USA" && countryCode !== "X1") {
    return "FOREIGN";
  }
  return (
    classifyCodeOrDesc(addr.stateOrCountry) ??
    classifyCodeOrDesc(addr.stateOrCountryDescription)
  );
}

function recentForms(meta: SecSubmissionsMeta): string[] {
  const forms = meta.filings?.recent?.form;
  if (!Array.isArray(forms)) return [];
  return forms.slice(0, 400).map((f) => String(f ?? "").trim()).filter(Boolean);
}

/**
 * Decide DOMESTIC / FOREIGN from a submissions JSON object.
 */
export function classifyIssuerType(meta: SecSubmissionsMeta): IssuerTypeResult {
  if (isTruthyFlag(meta.isAdr)) {
    return { issuerType: "FOREIGN", reason: "isAdr" };
  }

  const name = String(meta.name ?? "");
  if (/american depositary|\bADRs?\b|\bADSs?\b/i.test(name)) {
    return { issuerType: "FOREIGN", reason: "name_adr" };
  }

  const forms = recentForms(meta);
  if (forms.some((f) => ADR_FORM.test(f))) {
    return { issuerType: "FOREIGN", reason: "form_f6_adr" };
  }
  if (forms.some((f) => FOREIGN_ANNUAL_FORM.test(f))) {
    return { issuerType: "FOREIGN", reason: "form_20f_40f" };
  }

  const mailing = classifyAddress(meta.addresses?.mailing ?? null);
  const business = classifyAddress(meta.addresses?.business ?? null);
  if (mailing === "FOREIGN" || business === "FOREIGN") {
    return { issuerType: "FOREIGN", reason: "foreign_address" };
  }

  const incorp =
    classifyCodeOrDesc(meta.stateOfIncorporation) ??
    classifyCodeOrDesc(meta.stateOfIncorporationDescription);
  if (incorp) {
    return {
      issuerType: incorp,
      reason: incorp === "DOMESTIC" ? "us_state_of_incorp" : "foreign_state_of_incorp",
    };
  }

  if (mailing === "DOMESTIC" || business === "DOMESTIC") {
    return { issuerType: "DOMESTIC", reason: "us_address" };
  }

  if (forms.some((f) => US_ANNUAL_FORM.test(f))) {
    return { issuerType: "DOMESTIC", reason: "form_10k_10q" };
  }

  return { issuerType: null, reason: "insufficient_metadata" };
}

export function padCik(cik: string): string {
  return cik.replace(/\D/g, "").padStart(10, "0");
}

export async function fetchSecSubmissions(cik: string): Promise<SecSubmissionsMeta> {
  const padded = padCik(cik);
  if (!/^\d{10}$/.test(padded) || padded === "0000000000") {
    throw new Error(`invalid_cik:${cik}`);
  }
  const url = `https://data.sec.gov/submissions/CIK${padded}.json`;
  const res = await fetch(url, {
    headers: secHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`SEC submissions HTTP ${res.status} CIK${padded}`);
  }
  return (await res.json()) as SecSubmissionsMeta;
}
