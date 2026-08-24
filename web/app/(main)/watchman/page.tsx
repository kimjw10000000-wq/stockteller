import type { Metadata } from "next";
import { AlertsDashboard } from "@/components/alerts/AlertsDashboard";
import { SITE_NAME_KO } from "@/lib/site";

export const metadata: Metadata = {
  title: "경보",
  description: `${SITE_NAME_KO} — 지분희석·오퍼링·S-3/F-3 실시간 경보`,
  alternates: { canonical: "/watchman" },
};

export default function WatchmanPage() {
  return (
    <div className="relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2 -mt-8 -mb-8 min-h-[calc(100dvh-11rem)] bg-gradient-to-b from-sky-300 via-sky-400 to-cyan-500 px-4 py-8 sm:px-6">
      <div className="mx-auto w-full max-w-7xl">
        <AlertsDashboard />
      </div>
    </div>
  );
}
