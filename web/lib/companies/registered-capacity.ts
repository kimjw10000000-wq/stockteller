import type { SupabaseClient } from "@supabase/supabase-js";
import { padCik } from "@/lib/companies/issuer-type";
import { getUsListedCompany } from "@/lib/companies/search";
import {
  scanRegisteredCapacity,
  type RegisteredFilingDraft,
} from "@/lib/sec/registered-capacity-scan";
import { isActiveEffectDate, normalizeSecFileNumber, type IssuerType } from "@/lib/sec/offering-amount-parse";
import { sumActiveShelfCapacity } from "@/lib/sec/shelf-rollover";

const PAGE = 1000;
const ID_CHUNK = 200;

export async function persistRegisteredCapacity(
  admin: SupabaseClient,
  scan: {
    ticker: string;
    cikPadded: string;
    isUnlimitedShelf: boolean;
    filings: RegisteredFilingDraft[];
    totalRegisteredOfferingCapacity: number | null;
  }
): Promise<void> {
  const now = new Date().toISOString();
  const rows = scan.filings.map((f) => ({
    ticker: f.ticker,
    cik: f.cik,
    file_number: f.fileNumber,
    form_type: f.formType,
    effect_date: f.effectDate,
    max_offering_amount: f.maxOfferingAmount,
    is_active: f.isActive && f.status === "ACTIVE",
    status: f.status,
    prior_file_number: f.priorFileNumbers[0] ?? null,
    replaced_by_file_number: f.replacedByFileNumber,
    accession_number: f.accessionNumber,
    filing_url: f.filingUrl,
    parse_method: f.parseMethod,
    updated_at: now,
  }));

  if (rows.length) {
    const { error } = await admin.from("registered_filings").upsert(rows, {
      onConflict: "cik,file_number",
    });
    if (error) throw new Error(`registered_filings upsert: ${error.message}`);
  }

  // Rule 415(a)(6): retire cited prior file numbers for THIS CIK only.
  for (const f of scan.filings) {
    const priors = f.priorFileNumbers
      .map((n) => normalizeSecFileNumber(n))
      .filter((n): n is string => Boolean(n) && n !== f.fileNumber);
    if (!priors.length) continue;
    const { error } = await admin
      .from("registered_filings")
      .update({
        is_active: false,
        status: "REPLACED",
        replaced_by_file_number: f.fileNumber,
        updated_at: now,
      })
      .eq("cik", scan.cikPadded)
      .in("file_number", priors)
      .neq("file_number", f.fileNumber);
    if (error) throw new Error(`registered_filings rollover: ${error.message}`);
  }

  const { error: upErr } = await admin
    .from("us_listed_companies")
    .update({
      is_unlimited_shelf: scan.isUnlimitedShelf,
      total_registered_offering_capacity: scan.isUnlimitedShelf
        ? null
        : scan.totalRegisteredOfferingCapacity ?? 0,
      registered_capacity_updated_at: now,
    })
    .eq("cik", scan.cikPadded);
  if (upErr) throw new Error(`us_listed_companies capacity update: ${upErr.message}`);
}

export async function refreshRegisteredCapacityForTicker(
  admin: SupabaseClient,
  ticker: string
) {
  const company = await getUsListedCompany(admin, ticker).catch(() => null);
  const issuerType: IssuerType = company?.issuer_type === "FOREIGN" ? "FOREIGN" : "DOMESTIC";
  const scan = await scanRegisteredCapacity(ticker, { issuerType });
  if (!scan.ok) throw new Error(scan.error);
  await persistRegisteredCapacity(admin, scan);
  return scan;
}

export type ShelfFilingView = {
  fileNumber: string;
  formType: string;
  effectDate: string;
  maxOfferingAmount: number | null;
  status: "ACTIVE" | "REPLACED" | "EXPIRED";
  isActive: boolean;
  filingUrl: string | null;
  replacedByFileNumber: string | null;
};

export type ShelfCapacitySnapshot = {
  ticker: string;
  cik: string | null;
  issuerType: IssuerType | null;
  isUnlimitedShelf: boolean;
  totalRegisteredOfferingCapacity: number | null;
  registeredCapacityUpdatedAt: string | null;
  filings: ShelfFilingView[];
};

export async function loadRegisteredCapacitySnapshot(
  admin: SupabaseClient,
  tickerInput: string
): Promise<ShelfCapacitySnapshot | null> {
  const ticker = tickerInput.trim().toUpperCase().replace(/\./g, "-");
  if (!ticker) return null;

  const { data, error } = await admin
    .from("us_listed_companies")
    .select(
      "ticker,cik,issuer_type,is_unlimited_shelf,total_registered_offering_capacity,registered_capacity_updated_at"
    )
    .eq("ticker", ticker)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const cik = padCik(String(data.cik ?? ""));
  let q = admin
    .from("registered_filings")
    .select(
      "file_number,form_type,effect_date,max_offering_amount,is_active,status,filing_url,replaced_by_file_number"
    )
    .order("effect_date", { ascending: false });
  q = cik ? q.eq("cik", cik) : q.eq("ticker", ticker);
  const { data: rows, error: fErr } = await q;
  if (fErr) throw new Error(fErr.message);

  const filings: ShelfFilingView[] = (rows ?? []).map((raw) => {
    const row = raw as {
      file_number: string;
      form_type: string;
      effect_date: string;
      max_offering_amount: number | null;
      is_active: boolean;
      status: string | null;
      filing_url: string | null;
      replaced_by_file_number: string | null;
    };
    const effectDate = String(row.effect_date ?? "").slice(0, 10);
    const replaced = row.status === "REPLACED";
    const inWindow = isActiveEffectDate(effectDate);
    const status: ShelfFilingView["status"] = replaced
      ? "REPLACED"
      : inWindow
        ? "ACTIVE"
        : "EXPIRED";
    return {
      fileNumber: row.file_number,
      formType: row.form_type,
      effectDate,
      maxOfferingAmount: row.max_offering_amount,
      status,
      isActive: status === "ACTIVE",
      filingUrl: row.filing_url,
      replacedByFileNumber: row.replaced_by_file_number,
    };
  });

  const unlimited = Boolean(data.is_unlimited_shelf);
  return {
    ticker: data.ticker,
    cik: cik || null,
    issuerType: data.issuer_type === "FOREIGN" ? "FOREIGN" : data.issuer_type === "DOMESTIC" ? "DOMESTIC" : null,
    isUnlimitedShelf: unlimited,
    totalRegisteredOfferingCapacity: unlimited
      ? null
      : data.total_registered_offering_capacity != null
        ? Number(data.total_registered_offering_capacity)
        : 0,
    registeredCapacityUpdatedAt: data.registered_capacity_updated_at ?? null,
    filings,
  };
}

type FilingRow = {
  id: string;
  cik: string;
  form_type: string;
  effect_date: string;
  max_offering_amount: number | null;
  is_active: boolean;
  status: string | null;
  parse_method: string | null;
};

/**
 * Expire 3-year-old ACTIVE rows. Never revive REPLACED (415(a)(6) rollover).
 * Totals are always grouped by CIK.
 */
export async function recomputeExpiredCapacity(admin: SupabaseClient): Promise<{
  method: "sql" | "ts";
  filingsUpdated: number;
  companiesUpdated: number;
}> {
  const rpc = await admin.rpc("refresh_registered_capacity_totals");
  if (!rpc.error) {
    const raw = rpc.data;
    const d =
      typeof raw === "string"
        ? (JSON.parse(raw) as { filingsUpdated?: number; companiesUpdated?: number })
        : (raw as { filingsUpdated?: number; companiesUpdated?: number } | null);
    return {
      method: "sql",
      filingsUpdated: Number(d?.filingsUpdated ?? 0),
      companiesUpdated: Number(d?.companiesUpdated ?? 0),
    };
  }

  const filings: FilingRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("registered_filings")
      .select("id,cik,form_type,effect_date,max_offering_amount,is_active,status,parse_method")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as FilingRow[];
    filings.push(...chunk);
    if (chunk.length < PAGE) break;
  }

  const activate: string[] = [];
  const deactivate: string[] = [];
  const expireStatus: string[] = [];
  const now = new Date().toISOString();

  const forSum = filings.map((row) => {
    const replaced = row.status === "REPLACED";
    const inWindow = isActiveEffectDate(String(row.effect_date).slice(0, 10));
    const live = !replaced && inWindow;
    if (replaced) {
      if (row.is_active) deactivate.push(row.id);
    } else if (live) {
      if (!row.is_active) activate.push(row.id);
    } else {
      if (row.is_active) deactivate.push(row.id);
      if (row.status !== "EXPIRED") expireStatus.push(row.id);
    }
    return {
      cik: row.cik,
      isActive: live,
      status: (replaced ? "REPLACED" : live ? "ACTIVE" : "EXPIRED") as "ACTIVE" | "REPLACED" | "EXPIRED",
      formType: row.form_type,
      parseMethod: row.parse_method,
      maxOfferingAmount: row.max_offering_amount,
      effectDate: String(row.effect_date).slice(0, 10),
    };
  });

  const patch = async (ids: string[], values: Record<string, unknown>) => {
    for (let i = 0; i < ids.length; i += ID_CHUNK) {
      const slice = ids.slice(i, i + ID_CHUNK);
      const { error } = await admin.from("registered_filings").update(values).in("id", slice);
      if (error) throw new Error(error.message);
    }
  };
  await patch(activate, { is_active: true, status: "ACTIVE", updated_at: now });
  await patch(deactivate, { is_active: false, updated_at: now });
  await patch(expireStatus, { status: "EXPIRED", is_active: false, updated_at: now });

  const byCik = new Map<string, ReturnType<typeof sumActiveShelfCapacity>>();
  for (const row of forSum) {
    if (!byCik.has(row.cik)) {
      byCik.set(row.cik, sumActiveShelfCapacity(forSum, row.cik));
    }
  }

  let companiesUpdated = 0;
  for (const [cik, acc] of Array.from(byCik.entries())) {
    const { error } = await admin
      .from("us_listed_companies")
      .update({
        is_unlimited_shelf: acc.isUnlimitedShelf,
        total_registered_offering_capacity: acc.isUnlimitedShelf ? null : acc.total,
        registered_capacity_updated_at: now,
      })
      .eq("cik", cik);
    if (!error) companiesUpdated += 1;
  }

  return {
    method: "ts",
    filingsUpdated: activate.length + deactivate.length + expireStatus.length,
    companiesUpdated,
  };
}
