import type { Metadata } from "next";
import { LegalArticle } from "@/components/legal/LegalArticle";
import { CONTACT_EMAIL, SITE_NAME_EN, SITE_NAME_KO } from "@/lib/site";

export const metadata: Metadata = {
  title: "사이트 소개",
  description: `${SITE_NAME_KO} — 미국 주식 공시·상장유지·거래정지·거시지표를 정리하는 정보 사이트`,
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
        <li>공시 피드: 미국 SEC 공시를 요약해 보여 줍니다.</li>
        <li>상장폐지 D-Day / 종목 분석: 나스닥 상장 유지 기준, $1 입찰가 통보, 선반등록 규모.</li>
        <li>실시간 서킷 현황: 나스닥 Halt/Resume 및 국내 VI 참고 정보.</li>
        <li>주요지표: 미국 CPI / PPI 예측치와 공식 발표치.</li>
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
