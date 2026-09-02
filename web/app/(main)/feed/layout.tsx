export default function FeedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="feed-neo relative left-1/2 min-h-[calc(100vh-8rem)] w-screen -translate-x-1/2 -my-8 px-4 py-10 sm:px-6">
      <div className="mx-auto w-full max-w-7xl">{children}</div>
    </div>
  );
}
