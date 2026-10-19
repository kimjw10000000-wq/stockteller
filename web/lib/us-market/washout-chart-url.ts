export function washoutChartOrigin(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
}

export function washoutChartUrl(minute = Math.floor(Date.now() / 60_000)): string {
  return `${washoutChartOrigin()}/storage/v1/object/public/washout-catalog/current.json?m=${minute}`;
}

export function haltLiveUrl(second = Math.floor(Date.now() / 1000)): string {
  return `${washoutChartOrigin()}/storage/v1/object/public/washout-catalog/halts-live.json?s=${second}`;
}

export function reclaimOddsUrl(second = Math.floor(Date.now() / 1000)): string {
  return `${washoutChartOrigin()}/storage/v1/object/public/washout-catalog/odds.json?s=${second}`;
}

export function koreanNamesUrl(minute = Math.floor(Date.now() / 60_000)): string {
  const origin = washoutChartOrigin();
  if (!origin) return "";
  return `${origin}/storage/v1/object/public/washout-catalog/names-ko.json?m=${minute}`;
}
