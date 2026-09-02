/** AI 학습·무단 수집 크롤러 (robots.txt User-agent 및 미들웨어 차단 공통) */
export const AI_TRAINING_USER_AGENTS = [
  "GPTBot",
  "ChatGPT-User",
  "CCBot",
  "anthropic-ai",
  "ClaudeBot",
  "Claude-Web",
  "Claude-User",
  "Google-Extended",
  "Bytespider",
  "Amazonbot",
  "Applebot-Extended",
  "cohere-ai",
  "Diffbot",
  "PerplexityBot",
  "YouBot",
  "meta-externalagent",
  "Meta-ExternalAgent",
  "FacebookBot",
  "Google-CloudVertexBot",
  "Timpibot",
  "Webzio-Extended",
  "AI2Bot",
  "Ai2Bot-Dolma",
  "ImagesiftBot",
  "Omgilibot",
  "omgili",
  "PetalBot",
  "DeepSeekBot",
  "iaskspider",
] as const;

/** 브라우저가 아닌 스크래핑 라이브러리·CLI */
export const SCRAPER_UA_PATTERNS: RegExp[] = [
  /\bscrapy\b/i,
  /\bpython-requests\b/i,
  /\bpython-urllib\b/i,
  /\burllib3\b/i,
  /\bhttpx\b/i,
  /\baiohttp\b/i,
  /\bpuppeteer\b/i,
  /\bheadlesschrome\b/i,
  /\bselenium\b/i,
  /\bplaywright\b/i,
  /\bphantomjs\b/i,
  /\bcurl\b/i,
  /\bwget\b/i,
  /\bhttpie\b/i,
  /\baxios\b/i,
  /\bnode-fetch\b/i,
  /\bgo-http-client\b/i,
  /\bokhttp\b/i,
  /\blibwww-perl\b/i,
  /\bjava\/\d/i,
];

/** 검색엔진·SNS 미리보기 — 차단하지 않음 */
export const SEARCH_OR_PREVIEW_UA_PATTERNS: RegExp[] = [
  /\bgooglebot\b/i,
  /\bgoogle-inspectiontool\b/i,
  /\bbingbot\b/i,
  /\badidxbot\b/i,
  /\bduckduckbot\b/i,
  /\bslurp\b/i,
  /\byandex(bot|images)?\b/i,
  /\bbaiduspider\b/i,
  /\byeti\b/i,
  /\bnaverbot\b/i,
  /\bdaumoa\b/i,
  /\bapplebot\b/i,
  /\bfacebookexternalhit\b/i,
  /\bfacebot\b/i,
  /\btwitterbot\b/i,
  /\blinkedinbot\b/i,
  /\bslackbot\b/i,
  /\bdiscordbot\b/i,
  /\btelegrambot\b/i,
  /\btelegram\b/i,
  /\bwhatsapp\b/i,
  /\bkakaotalk-scrap\b/i,
  /\bkakaotalk\b/i,
  /\bkakaostory\b/i,
  /\bkakaolink\b/i,
  /\bkakaoinsight\b/i,
  /\bdevtalk\.kakao\.com\b/i,
  /\bpinterest\b/i,
  /\bredditbot\b/i,
  /\bthreadsbot\b/i,
  /\bline[-_/ ]/i,
  /\bembed\.ly\b/i,
  /\bembedly\b/i,
];

export function isAiTrainingCrawler(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  return AI_TRAINING_USER_AGENTS.some((name) => ua.includes(name.toLowerCase()));
}

export function isSearchOrPreviewBot(userAgent: string): boolean {
  if (isAiTrainingCrawler(userAgent)) return false;
  return SEARCH_OR_PREVIEW_UA_PATTERNS.some((re) => re.test(userAgent));
}

export function isScraperLibrary(userAgent: string): boolean {
  return SCRAPER_UA_PATTERNS.some((re) => re.test(userAgent));
}

export function isInternalAutomation(request: {
  headers: { get(name: string): string | null };
}): boolean {
  if (request.headers.get("x-vercel-cron") === "1") return true;
  const ua = request.headers.get("user-agent") ?? "";
  if (/\bvercel-cron\b/i.test(ua)) return true;
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization")?.trim() ?? "";
  return auth === `Bearer ${secret}`;
}
