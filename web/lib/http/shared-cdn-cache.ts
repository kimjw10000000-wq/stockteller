/** 열린 탭이 늘어도 원본 조회는 이 초 동안 한 번이다. */
export function sharedCdnCache(seconds: number, staleSeconds = seconds): Record<string, string> {
  const value = `public, max-age=${seconds}, s-maxage=${seconds}, stale-while-revalidate=${staleSeconds}`;
  return {
    "Cache-Control": value,
    "CDN-Cache-Control": value,
    "Vercel-CDN-Cache-Control": value,
  };
}
