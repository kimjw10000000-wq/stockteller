import type { Metadata } from "next";
import { Activity, PauseCircle, PlayCircle } from "lucide-react";
import { SITE_NAME_KO } from "@/lib/site";

export const metadata: Metadata = {
  title: "실시간 서킷 현황",
  description: `${SITE_NAME_KO} — 나스닥/미국 주식 거래 정지(Halt) 및 해제 현황`,
  alternates: { canonical: "/halts" },
};

const HIGHLIGHTS = [
  {
    icon: PauseCircle,
    title: "거래 정지(Halt)",
    body: "뉴스·변동성·규제 사유로 거래가 멈춘 종목을 모아 보여 줍니다.",
  },
  {
    icon: PlayCircle,
    title: "정지 해제",
    body: "재개(Resume)된 종목과 정지 구간을 구분해, 방금 풀린 이슈를 빠르게 확인합니다.",
  },
  {
    icon: Activity,
    title: "서킷브레이커 맥락",
    body: "개별 종목 LULD·시장 전체 서킷과 연결되는 이벤트를 한 화면에서 추적합니다.",
  },
] as const;

export default function HaltsPage() {
  return (
    <main>
      <p className="text-sm font-medium text-muted-foreground">Market · Halts</p>
      <h1 className="mt-1 text-2xl font-semibold text-foreground sm:text-3xl">
        실시간 서킷 현황
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
        현재 나스닥/미국 주식의 거래 정지(Halt)와 해제 현황을 확인하는 페이지입니다.
        실시간 피드 연동 후 종목·사유·시각이 자동 갱신됩니다.
      </p>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
          <li
            key={title}
            className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50"
          >
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-input-background text-foreground">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <h2 className="text-base font-semibold text-foreground">{title}</h2>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</p>
          </li>
        ))}
      </ul>

      <div className="mt-8 overflow-hidden rounded-lg border border-border">
        <div className="border-b border-border bg-input-background px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">현재 Halt / Resume</h2>
        </div>
        <div className="px-4 py-10 text-center">
          <p className="text-sm font-medium text-foreground">실시간 목록 연동 준비 중</p>
          <p className="mt-1 text-xs text-muted-foreground">
            거래소 halt 피드가 연결되면 이 표에 종목·사유·정지/해제 시각이 표시됩니다.
          </p>
        </div>
      </div>
    </main>
  );
}
