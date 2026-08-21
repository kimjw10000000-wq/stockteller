import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { SITE_NAME_KO } from "@/lib/site";

export const metadata: Metadata = {
  title: "News/SEC",
  description: `${SITE_NAME_KO} — AI Newsfilter 및 SEC EDGAR 공시 요약·감성 분석`,
  alternates: { canonical: "/news-sec" },
};

export default function NewsSecPage() {
  return (
    <main className="space-y-6">
      <header>
        <p className="text-sm font-medium text-muted-foreground">Newsfilter · EDGAR</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground sm:text-3xl">News/SEC</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          AI가 Newsfilter 기사와 SEC EDGAR 공시를 요약하고, 호재·악재 감성을 구분해 보여 줍니다.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border">
          <CardContent>
            <h2 className="text-base font-semibold text-foreground">Newsfilter</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              뉴스 원문을 수집해 종목별로 요약합니다. 목록이 준비되면 이 영역에 표시됩니다.
            </p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent>
            <h2 className="text-base font-semibold text-foreground">SEC EDGAR</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              8-K 등 공시 요약을 호재·악재 신호와 함께 보여 줍니다. 목록이 준비되면 이 영역에
              표시됩니다.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
