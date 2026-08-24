import type { Metadata } from "next";
import { LegalArticle } from "@/components/legal/LegalArticle";
import { CONTACT_EMAIL, SITE_NAME_EN, SITE_NAME_KO } from "@/lib/site";

export const metadata: Metadata = {
  title: "사이트 소개",
  description: `${SITE_NAME_KO} — 미국 주식 공시·희석 감시·거래정지·거시지표를 정리하는 정보 사이트`,
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <LegalArticle title={`${SITE_NAME_KO} 소개`} updated="2026-08-18">
      <p>
        {SITE_NAME_KO}({SITE_NAME_EN}, whyup.net)은 미국 상장 종목의 공시와 시장 데이터를 모아, 개인
        투자자가 변동 이유를 빠르게 살펴볼 수 있게 만든 정보 사이트입니다. 매매를 대행하거나 종목을
        추천하지 않습니다.
      </p>
      <h2>제공하는 도구</h2>
      <ul>
        <li>경보: 오퍼링·S-3/F-3 등 지분희석 관련 공시를 감시하고 알림으로 알려 줍니다.</li>
        <li>분석글: 사람이 작성한 분석글을 모읍니다.</li>
        <li>News/SEC: Newsfilter 기사와 SEC EDGAR 공시를 요약하고 호재·악재를 구분합니다.</li>
        <li>실시간 발표: 미국 CPI / PPI 예측치와 공식 발표치, 기업 실적 비교.</li>
        <li>TradeHalt: 나스닥 Halt/Resume 및 국내 VI 참고 정보.</li>
        <li>비슷한 급등주 찾기: 급등 패턴이 비슷한 종목을 찾는 기능(준비 중).</li>
      </ul>
      <h2>운영</h2>
      <p>
        데이터는 SEC EDGAR, 거래소 공개 RSS, BLS 등 공개 출처를 사용합니다. 자동화 요약이 포함될 수
        있으며, 원문 공시가 우선합니다. 문의는{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> 로 보내 주세요.
      </p>
    </LegalArticle>
  );
}
