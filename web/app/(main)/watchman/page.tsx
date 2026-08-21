import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { SITE_NAME_KO } from "@/lib/site";

export const metadata: Metadata = {
  title: "파수꾼",
  description: `${SITE_NAME_KO} — 지분희석·오퍼링·S-3/F-3 감시`,
  alternates: { canonical: "/watchman" },
};

export default function WatchmanPage() {
  return (
    <main className="space-y-6">
      <header>
        <p className="text-sm font-medium text-muted-foreground">Watchman</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground sm:text-3xl">파수꾼</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          오퍼링, S-3/F-3 선반등록 등 지분희석과 관련된 공시를 감시하고 알림으로 보여 줍니다.
        </p>
      </header>

      <Card className="border-border">
        <CardContent>
          <p className="text-sm text-muted-foreground">
            아직 표시할 희석 알림이 없습니다. 감시 대상 공시가 수집되면 이 목록에 나타납니다.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
