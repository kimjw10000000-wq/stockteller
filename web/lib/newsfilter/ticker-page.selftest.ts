import { parseNewsfilterTickerHtml } from "./ticker-page";

const html = `
<li class="border-b">
  <time dateTime="2026-10-20T11:30:00Z">Oct 20, 2026, 7:30 AM ET</time>
  <span aria-hidden="true">·</span><span>BusinessWire</span>
  <h2><a href="https://newsfilter.io/a/fac8cca704f256e03c95a968636328b9">AST SpaceMobile Advances Service Readiness</a></h2>
  <p>Initial, intermittent coverage targeted before year-end 2026 <!-- --> ...</p>
</li>
<li>
  <time dateTime="2026-10-01T11:30:00Z">Oct 1</time>
  <span>PR Newswire</span>
  <h2><a href="https://newsfilter.io/a/abc123">Older headline</a></h2>
  <p>Old teaser</p>
</li>
`;

const articles = parseNewsfilterTickerHtml(html);
if (articles.length !== 2) throw new Error(`expected 2, got ${articles.length}`);
if (articles[0].id !== "fac8cca704f256e03c95a968636328b9") throw new Error(articles[0].id);
if (articles[0].source !== "BusinessWire") throw new Error(articles[0].source);
if (!articles[0].teaser.startsWith("Initial, intermittent")) throw new Error(articles[0].teaser);
if (articles[1].title !== "Older headline") throw new Error(articles[1].title);
console.log("newsfilter ticker-page selftest ok");
