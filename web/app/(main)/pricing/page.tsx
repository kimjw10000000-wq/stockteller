import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME_KO } from "@/lib/site";

export const metadata: Metadata = {
  title: "요금제",
  description: `${SITE_NAME_KO} Pro — 지분희석 경보 슬롯 4개`,
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-8">
      <header>
        <p className="text-sm font-medium text-muted-foreground">Pricing</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground sm:text-3xl">요금제</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
          지분희석(오퍼링) 경보 슬롯 정책입니다. 카드 결제는 Paddle 연동 후 열립니다.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Free</h2>
          <p className="mt-1 text-sm text-muted-foreground">기본</p>
          <ul className="mt-4 space-y-2 text-sm text-foreground">
            <li>알람 슬롯 1개 (종목 변경만 가능)</li>
            <li>미국 동부 04:00 AM 기준 하루 1회 발송</li>
          </ul>
        </section>
        <section className="rounded-xl border border-sky-400/50 bg-card p-6">
          <p className="text-xs font-medium uppercase tracking-wider text-sky-600">권장</p>
          <h2 className="mt-1 text-lg font-semibold">Pro</h2>
          <p className="mt-1 text-sm text-muted-foreground">슬롯 4개</p>
          <ul className="mt-4 space-y-2 text-sm text-foreground">
            <li>알람 슬롯 4개</li>
            <li>발송 횟수 제한 없음</li>
          </ul>
          <p className="mt-6 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            결제 연동 준비 중입니다. 지금은 플랜이 자동으로 바뀌지 않습니다.
          </p>
        </section>
      </div>

      <p className="text-sm text-muted-foreground">
        <Link href="/watchman" className="font-medium text-foreground underline-offset-4 hover:underline">
          경보로 돌아가기
        </Link>
      </p>
    </main>
  );
}
