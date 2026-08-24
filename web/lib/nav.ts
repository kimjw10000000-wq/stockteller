export type SiteNavItem = {
  href: string;
  labelKey: string;
  descKey: string;
  /** pathname이 이 패턴이면 활성 */
  match: (pathname: string) => boolean;
};

/** 검색창 아래 가로 GNB (좌측 → 우측 순서) */
export const SITE_GNB_ITEMS: SiteNavItem[] = [
  {
    href: "/watchman",
    labelKey: "nav.alerts",
    descKey: "nav.alertsDesc",
    match: (pathname) => pathname.startsWith("/watchman"),
  },
  {
    href: "/feed",
    labelKey: "nav.articles",
    descKey: "nav.articlesDesc",
    match: (pathname) =>
      pathname === "/" ||
      pathname.startsWith("/feed") ||
      pathname.startsWith("/disclosure") ||
      pathname.startsWith("/news/"),
  },
  {
    href: "/news-sec",
    labelKey: "nav.newsSec",
    descKey: "nav.newsSecDesc",
    match: (pathname) => pathname.startsWith("/news-sec"),
  },
  {
    href: "/indicators",
    labelKey: "nav.indicators",
    descKey: "nav.indicatorsDesc",
    match: (pathname) => pathname.startsWith("/indicators"),
  },
  {
    href: "/halts",
    labelKey: "nav.halts",
    descKey: "nav.haltsDesc",
    match: (pathname) => pathname.startsWith("/halts"),
  },
  {
    href: "/similar-movers",
    labelKey: "nav.similar",
    descKey: "nav.similarDesc",
    match: (pathname) => pathname.startsWith("/similar-movers"),
  },
];

/** 모바일 드로어 등에서 GNB와 동일 항목 사용 */
export const SITE_NAV_ITEMS = SITE_GNB_ITEMS;
