export type SiteNavItem = {
  href: string;
  label: string;
  description: string;
  /** pathname이 이 패턴이면 활성 */
  match: (pathname: string) => boolean;
};

export const SITE_NAV_ITEMS: SiteNavItem[] = [
  {
    href: "/",
    label: "홈",
    description: "메인 화면 및 분석 보고서 모음",
    match: (pathname) =>
      pathname === "/" ||
      pathname.startsWith("/feed") ||
      pathname.startsWith("/disclosure") ||
      pathname.startsWith("/news") ||
      pathname.startsWith("/search") ||
      pathname.startsWith("/volatile"),
  },
  {
    href: "/compliance",
    label: "상장폐지 D-Day / 종목 분석",
    description: "나스닥 5550·S-3/F-3 오퍼링 가능성·상장폐지 유예기간",
    match: (pathname) => pathname.startsWith("/compliance"),
  },
  {
    href: "/halts",
    label: "실시간 서킷 현황",
    description: "나스닥/미국 주식 거래 정지(Halt) 및 해제 현황",
    match: (pathname) => pathname.startsWith("/halts"),
  },
];
