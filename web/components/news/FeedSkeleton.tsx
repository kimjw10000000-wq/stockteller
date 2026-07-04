export function FeedGridSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-36 animate-pulse rounded-xl border border-border bg-muted/60" />
      ))}
    </div>
  );
}

export function FeedPageSkeleton() {
  return (
    <main className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="h-7 w-28 animate-pulse rounded-md bg-muted" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 w-20 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      </div>
      <FeedGridSkeleton />
    </main>
  );
}
