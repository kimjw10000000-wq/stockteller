export type SiteNavItem = {
  href: string;
  label: string;
  description: string;
  /** pathname이 이 패턴이면 활성 */
  match: (pathname: string) => boolean;
};

/** 검색창 아래 가로 GNB (좌측 → 우측 순서) */
export const SITE_GNB_ITEMS: SiteNavItem[] = [
  {
    href: "/watchman",
    label: "파수꾼",
    description: "지분희석·오퍼링·S-3/F-3 감시",
    match: (pathname) => pathname.startsWith("/watchman"),
  },
  {
    href: "/feed",
    label: "분석글",
    description: "사람이 작성한 분석글 목록",
    match: (pathname) =>
      pathname === "/" ||
      pathname.startsWith("/feed") ||
      pathname.startsWith("/disclosure") ||
      pathname.startsWith("/news/"),
  },
  {
    href: "/news-sec",
    label: "News/SEC",
    description: "Newsfilter 및 SEC EDGAR 공시 요약",
    match: (pathname) => pathname.startsWith("/news-sec"),
  },
  {
    href: "/indicators",
    label: "실시간 발표",
    description: "CPI·PPI 및 기업 실적 발표",
    match: (pathname) => pathname.startsWith("/indicators"),
  },
  {
    href: "/halts",
    label: "TradeHalt",
    description: "미국 주식 거래 정지·재개",
    match: (pathname) => pathname.startsWith("/halts"),
  },
  {
    href: "/similar-movers",
    label: "비슷한 급등주 찾기",
    description: "준비 중인 기능",
    match: (pathname) => pathname.startsWith("/similar-movers"),
  },
];
