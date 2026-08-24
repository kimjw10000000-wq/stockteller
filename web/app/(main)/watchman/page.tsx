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
    <main>
      <AlertsDashboard />
    </main>
  );
}
