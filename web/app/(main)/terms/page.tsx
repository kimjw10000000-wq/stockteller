import type { Metadata } from "next";
import { LegalArticle } from "@/components/legal/LegalArticle";
import { DATA_COPYRIGHT_NOTICE, DISCLAIMER_INVEST } from "@/lib/legal";
import { CONTACT_EMAIL, SITE_NAME_KO } from "@/lib/site";

export const metadata: Metadata = {
  title: "이용약관",
  description: `${SITE_NAME_KO} 이용약관 — 서비스 이용, 저작권, 무단 수집 금지`,
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalArticle title="이용약관" updated="2026-08-19">
      <p>
        이 약관은 {SITE_NAME_KO}(whyup.net)이 제공하는 웹 서비스의 이용 조건입니다. 사이트에 접속하거나
        계정을 만들면 이 약관에 동의한 것으로 봅니다.
      </p>
      <h2>서비스</h2>
      <p>
        공시·거래소 공개 자료와 뉴스를 바탕으로 한 정보 정리 및 AI 요약을 제공합니다. 서비스 내용과
        제공 범위는 사전 고지 없이 바뀔 수 있습니다.
      </p>
      <h2>저작권 및 무단 수집 금지</h2>
      <p>{DATA_COPYRIGHT_NOTICE}</p>
      <p>
        로봇·스크립트·자동화 도구를 이용한 대량 수집, 미러링, 학습 데이터 구축은 허용되지 않습니다.
        검색엔진의 정상적인 색인은 robots.txt를 따릅니다.
      </p>
      <h2>계정</h2>
      <p>
        이메일 또는 소셜 로그인으로 가입할 수 있습니다. 계정 보안은 이용자 책임이며, 부정 이용이 확인되면
        접근을 제한할 수 있습니다.
      </p>
      <h2>면책</h2>
      <p>{DISCLAIMER_INVEST}</p>
      <h2>문의</h2>
      <p>
        약관 문의는 <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> 로 보내 주세요.
      </p>
    </LegalArticle>
  );
}
