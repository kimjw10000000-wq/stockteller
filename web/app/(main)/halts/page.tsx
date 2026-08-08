import type { Metadata } from "next";
import { Activity, PauseCircle, PlayCircle } from "lucide-react";
import { TradeHaltsPanel } from "@/components/halts/TradeHaltsPanel";
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
    body: "호가 재개·거래 재개 시각(ET)이 공지되면 바로 표에 표시합니다.",
  },
  {
    icon: Activity,
    title: "1분 갱신",
    body: "NASDAQ Trade Halt RSS를 약 1분 간격으로 동기화합니다.",
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
        나스닥/미국 주식의 거래 정지(Halt)와 재개(Resume) 일정을 확인합니다. 거래 재개 시각이
        공지된 종목은 &quot;재개 예정&quot;으로 표시됩니다.
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

      <TradeHaltsPanel />
    </main>
  );
}
