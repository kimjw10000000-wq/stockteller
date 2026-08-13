import type { IndicatorId } from "./types";

export type BlsApiActual = {
  actual: number;
  period: "mom";
  observationPeriod: string;
  message: string;
};

export type BlsApiBundle = Partial<Record<IndicatorId, BlsApiActual>>;

/** CPI-U All items SA; PPI Final demand SA */
export const BLS_SERIES: Record<IndicatorId, string> = {
  CPI: "CUSR0000SA0",
  PPI: "WPSFD4",
};

type BlsObservation = {
  year: string;
  period: string;
  periodName?: string;
  value: string;
  latest?: string;
};

type BlsApiResponse = {
  status?: string;
  message?: string[] | string;
  Results?: {
    series?: Array<{
      seriesID: string;
      data?: BlsObservation[];
    }>;
  };
};

/** BLS headline MoM is index ratio rounded to 1 decimal. */
export function momPercentFromIndexes(latest: number, previous: number): number {
  if (!Number.isFinite(latest) || !Number.isFinite(previous) || previous === 0) {
    throw new Error("invalid_index");
  }
  return Math.round((latest / previous - 1) * 1000) / 10;
}

export function blsPeriodToMonth(year: string, period: string): string | null {
  const m = period.match(/^M(\d{2})$/i);
  if (!m) return null;
  return `${year}-${m[1]}`;
}

function parseIndex(value: string): number | null {
  const n = Number(value.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function actualFromObservations(data: BlsObservation[]): BlsApiActual | null {
  const monthly = data.filter((d) => /^M\d{2}$/i.test(d.period));
  if (monthly.length < 2) return null;
  const latest = monthly[0]!;
  const prev = monthly[1]!;
  const latestN = parseIndex(latest.value);
  const prevN = parseIndex(prev.value);
  if (latestN == null || prevN == null) return null;
  const actual = momPercentFromIndexes(latestN, prevN);
  const observationPeriod = blsPeriodToMonth(latest.year, latest.period);
  if (!observationPeriod) return null;
  return {
    actual,
    period: "mom",
    observationPeriod,
    message: `BLS API ${observationPeriod} MoM ${actual}% (index ${latestN} / ${prevN})`,
  };
}

export async function fetchBlsApiActuals(): Promise<BlsApiBundle> {
  const endyear = new Date().getUTCFullYear();
  const body: Record<string, unknown> = {
    seriesid: [BLS_SERIES.CPI, BLS_SERIES.PPI],
    startyear: String(endyear - 1),
    endyear: String(endyear),
  };
  const key = process.env.BLS_API_KEY?.trim();
  if (key) body.registrationkey = key;

  const res = await fetch("https://api.bls.gov/publicAPI/v2/timeseries/data/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent":
        process.env.BLS_USER_AGENT?.trim() ||
        "WhyupIndicators/1.0 (whyup.net; indicators@whyup.net)",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`BLS API HTTP ${res.status}`);
  }
  const json = (await res.json()) as BlsApiResponse;
  if (json.status && json.status !== "REQUEST_SUCCEEDED") {
    const msg = Array.isArray(json.message) ? json.message.join("; ") : json.message;
    throw new Error(`BLS API ${json.status}${msg ? `: ${msg}` : ""}`);
  }

  const out: BlsApiBundle = {};
  const seriesById = new Map(
    (json.Results?.series ?? []).map((s) => [s.seriesID, s.data ?? []])
  );
  for (const id of ["CPI", "PPI"] as IndicatorId[]) {
    const rows = seriesById.get(BLS_SERIES[id]);
    if (!rows?.length) continue;
    const hit = actualFromObservations(rows);
    if (hit) out[id] = hit;
  }
  return out;
}

let mem: { at: number; data: BlsApiBundle } | null = null;
const MEM_TTL_MS = 10 * 60 * 1000;

export async function fetchBlsApiActualsMemo(): Promise<BlsApiBundle> {
  if (mem && Date.now() - mem.at < MEM_TTL_MS) return mem.data;
  const data = await fetchBlsApiActuals();
  mem = { at: Date.now(), data };
  return data;
}
