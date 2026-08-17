import type { Metadata } from "next";
import { LegalArticle } from "@/components/legal/LegalArticle";
import { CONTACT_EMAIL, SITE_NAME_KO } from "@/lib/site";

export const metadata: Metadata = {
  title: "개인정보처리방침",
  description: `${SITE_NAME_KO} 개인정보처리방침 — 쿠키, 분석, 광고`,
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalArticle title="개인정보처리방침" updated="2026-08-18">
      <p>
        왜올라(whyup.net)는 서비스 제공에 필요한 범위에서만 정보를 처리합니다. 공개 웹은 회원 가입 없이
        이용할 수 있습니다.
      </p>
      <h2>수집하는 정보</h2>
      <ul>
        <li>문의 메일을 보낼 때: 보낸 사람 주소와 메일 내용.</li>
        <li>관리자 로그인: 운영 콘솔 접근용 계정(일반 이용자에게 해당 없음).</li>
        <li>
          자동 수집: 접속 일시, 브라우저 종류, 방문 페이지 등 서비스 운영·보안을 위한 로그. 개인을
          식별할 목적으로 쓰지 않습니다.
        </li>
      </ul>
      <h2>쿠키 및 분석</h2>
      <p>
        사이트는 호스팅 제공자(Vercel)의 Analytics를 사용할 수 있습니다. 방문 통계(페이지뷰 등)를
        집계하며, 광고 식별 목적의 프로파일링을 하지 않습니다.
      </p>
      <h2>광고(Google AdSense)</h2>
      <p>
        Google AdSense 승인 후 광고가 게재되면 Google 및 제휴 네트워크가 쿠키·기기 식별자를 사용해
        관심 기반 광고를 표시할 수 있습니다. 이용자는{" "}
        <a href="https://adssettings.google.com" rel="noopener noreferrer" target="_blank">
          Google 광고 설정
        </a>
        에서 맞춤 광고를 관리할 수 있습니다. 광고가 켜지기 전에는 이 쿠키를 사용하지 않습니다.
      </p>
      <h2>보관 및 제3자</h2>
      <p>
        호스팅·데이터베이스는 Vercel, Supabase 등 인프라 사업자가 처리합니다. 법령상 의무가 있는 경우
        외에 개인정보를 판매하지 않습니다. 문의 메일은 답변에 필요한 기간만 보관합니다.
      </p>
      <h2>권리 및 문의</h2>
      <p>
        열람·정정·삭제 요청은 <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> 로 보내 주세요.
        방침이 바뀌면 이 페이지의 날짜를 업데이트합니다.
      </p>
    </LegalArticle>
  );
}
