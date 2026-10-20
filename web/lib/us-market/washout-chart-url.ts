export function washoutChartOrigin(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
}

export function washoutChartUrl(): string {
  return "/api/washout";
}

export function haltLiveUrl(): string {
  return "/api/halts-live";
}

export function reclaimOddsUrl(): string {
  return "/api/reclaim-odds";
}

export function koreanNamesUrl(): string {
  return "/api/korean-names";
}
