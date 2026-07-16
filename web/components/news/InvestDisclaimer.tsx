const DISCLAIMER_TITLE = "⚠️ 투자 유의사항 (Disclaimer)";
const DISCLAIMER_BODY =
  "본 분석글은 국내외 공식 데이터 및 뉴스를 바탕으로 작성된 단순 정보 제공 목적의 콘텐츠이며, 특정 종목에 대한 매수 또는 매도 추천이 아닙니다. 글에 포함된 시장 전망 및 분석은 작성자의 주관적 견해를 포함할 수 있으며, 실제 사실과 다를 수 있습니다. 투자에 대한 최종 결정과 책임은 투자자 본인에게 있으며, 본 사이트는 제공된 정보를 바탕으로 행해진 어떠한 투자 결과에 대해서도 법적 책임을 지지 않습니다.";

export function InvestDisclaimer() {
  return (
    <aside
      className="mt-8 rounded-lg border border-border/80 bg-muted/30 px-4 py-4 sm:px-5"
      aria-labelledby="invest-disclaimer-heading"
    >
      <h2
        id="invest-disclaimer-heading"
        className="text-sm font-medium text-muted-foreground"
      >
        {DISCLAIMER_TITLE}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground/90">
        {DISCLAIMER_BODY}
      </p>
    </aside>
  );
}
