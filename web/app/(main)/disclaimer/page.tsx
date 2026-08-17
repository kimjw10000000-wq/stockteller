import type { Metadata } from "next";
import { LegalArticle } from "@/components/legal/LegalArticle";
import { DISCLAIMER_BODY } from "@/lib/legal";
import { SITE_NAME_KO } from "@/lib/site";

export const metadata: Metadata = {
  title: "투자 유의사항",
  description: `${SITE_NAME_KO} 투자 유의사항 — 정보 제공 목적이며 투자 권유가 아닙니다`,
  alternates: { canonical: "/disclaimer" },
};

export default function DisclaimerPage() {
  return (
    <LegalArticle title="투자 유의사항" updated="2026-08-18">
      <p>{DISCLAIMER_BODY}</p>
      <h2>자동화 요약</h2>
      <p>
        공시·뉴스 요약은 원문을 줄인 참고 자료입니다. 투자 전에는 SEC EDGAR 등 공식 원문을 확인하세요.
        지연·누락·오역이 있을 수 있습니다.
      </p>
    </LegalArticle>
  );
}
