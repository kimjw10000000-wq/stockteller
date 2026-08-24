import { FeedGridSkeleton } from "@/components/news/FeedSkeleton";

/** 헤더·푸터는 layout에 유지하고 본문만 스켈레톤 */
export default function MainLoading() {
  return (
    <div className="space-y-6" aria-hidden>
      <div className="h-8 w-40 animate-pulse rounded-md bg-muted" />
      <div className="h-4 w-full max-w-xl animate-pulse rounded-md bg-muted/80" />
      <FeedGridSkeleton />
    </div>
  );
}
