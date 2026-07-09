import { Lock } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type PremiumGateProps = {
  title: string;
};

export function PremiumGate({ title }: PremiumGateProps) {
  return (
    <div
      className="relative mt-8 overflow-hidden rounded-xl border border-amber-200/60 bg-amber-50/50 p-8 text-center dark:border-amber-900/40 dark:bg-amber-950/20"
      role="alert"
    >
      <div className="mx-auto flex max-w-md flex-col items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
          <Lock className="h-7 w-7 text-amber-700 dark:text-amber-300" aria-hidden />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">유료회원용입니다</h2>
          <p className="text-sm text-muted-foreground">
            「{title}」의 본문은 유료 회원만 열람할 수 있습니다.
            <br />
            제목은 누구나 확인할 수 있으며, 본문은 유료 구독 후 이용 가능합니다.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/feed">뉴스 목록으로 돌아가기</Link>
        </Button>
      </div>
    </div>
  );
}
