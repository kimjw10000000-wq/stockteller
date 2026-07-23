import type { Metadata } from "next";
import { AlertTriangle, CalendarClock, Merge } from "lucide-react";
import { SITE_NAME_KO } from "@/lib/site";

export const metadata: Metadata = {
  title: "상장유지 D-Day",
  description: `${SITE_NAME_KO} — 나스닥 $1 미달, 주식 병합, 상장폐지 유예기간 카운트다운 진단`,
  alternates: { canonical: "/compliance" },
};

const SECTIONS = [
  {
    icon: AlertTriangle,
    title: "나스닥 $1 미달",
    body: "주가가 $1 아래로 일정 기간 유지되면 상장유지 요건 위반 경고가 나올 수 있습니다. 유예기간과 회복 요건을 한눈에 확인합니다.",
  },
  {
    icon: Merge,
    title: "주식 병합(Reverse Split)",
    body: "주가 회복을 위한 병합 공시·비율·효력일을 추적해, 상장유지와 희석·유동성 영향을 함께 살핍니다.",
  },
  {
    icon: CalendarClock,
    title: "상장폐지 유예 D-Day",
    body: "유예 만료일까지 남은 일수를 카운트다운으로 보여 줍니다. 공시·시세 이벤트가 쌓이면 자동 갱신됩니다.",
  },
] as const;

export default function CompliancePage() {
  return (
    <main>
      <p className="text-sm font-medium text-muted-foreground">Compliance · D-Day</p>
      <h1 className="mt-1 text-2xl font-semibold text-foreground sm:text-3xl">
        상장유지 D-Day
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
        나스닥 $1 미달, 주식 병합, 상장폐지 유예기간을 모아 카운트다운으로 진단하는 페이지입니다.
        대상 종목·만료일 데이터 연동은 순차적으로 확장됩니다.
      </p>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map(({ icon: Icon, title, body }) => (
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

      <div className="mt-8 rounded-lg border border-dashed border-border bg-input-background/60 px-4 py-8 text-center">
        <p className="text-sm font-medium text-foreground">종목별 D-Day 보드 준비 중</p>
        <p className="mt-1 text-xs text-muted-foreground">
          SEC·거래소 공시와 연동되면 여기서 유예 만료 카운트다운이 표시됩니다.
        </p>
      </div>
    </main>
  );
}
