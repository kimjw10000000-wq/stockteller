import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { SITE_NAME_KO } from "@/lib/site";

export const metadata: Metadata = {
  title: "비슷한 급등주 찾기",
  description: `${SITE_NAME_KO} — 비슷한 급등주 찾기 (준비 중)`,
  alternates: { canonical: "/similar-movers" },
};

export default function SimilarMoversPage() {
  return (
    <main className="space-y-6">
      <header>
        <p className="text-sm font-medium text-muted-foreground">Similar movers</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground sm:text-3xl">
          비슷한 급등주 찾기
        </h1>
      </header>

      <Card className="border-border">
        <CardContent>
          <p className="text-base font-medium text-foreground">준비 중인 기능입니다</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            급등 패턴이 비슷한 종목을 찾아 보여주는 화면을 준비하고 있습니다.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
