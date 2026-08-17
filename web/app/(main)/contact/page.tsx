import type { Metadata } from "next";
import { LegalArticle } from "@/components/legal/LegalArticle";
import { CONTACT_EMAIL, SITE_NAME_KO } from "@/lib/site";

export const metadata: Metadata = {
  title: "문의",
  description: `${SITE_NAME_KO} 문의 — ${CONTACT_EMAIL}`,
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <LegalArticle title="문의" updated="2026-08-18">
      <p>서비스 오류, 데이터 정정, 제휴·광고 관련 문의는 아래 이메일로 보내 주세요.</p>
      <p>
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>
      <p>개별 종목 매매 조언이나 수익률 보장 문의에는 답변하지 않습니다.</p>
    </LegalArticle>
  );
}
