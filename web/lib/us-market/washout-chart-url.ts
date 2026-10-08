export function washoutChartOrigin(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
}

export function washoutChartUrl(minute = Math.floor(Date.now() / 60_000)): string {
  return `${washoutChartOrigin()}/storage/v1/object/public/washout-catalog/current.json?m=${minute}`;
}
