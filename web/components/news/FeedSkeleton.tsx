export function FeedGridSkeleton() {
  return (
    <div className="grid gap-5 md:grid-cols-2 md:gap-6" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="feed-neo-card h-44 animate-pulse" />
      ))}
    </div>
  );
}

export function FeedPageSkeleton() {
  return (
    <main className="space-y-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="feed-neo-inset h-9 w-28 rounded-lg" />
        <div className="flex flex-wrap gap-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="feed-neo-pill h-9 w-20" />
          ))}
        </div>
      </div>
      <FeedGridSkeleton />
    </main>
  );
}
