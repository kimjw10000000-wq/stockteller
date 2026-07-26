import type { Metadata } from "next";
import { ComplianceDdaySearch } from "@/components/compliance/ComplianceDdaySearch";
import { SITE_NAME_KO } from "@/lib/site";

export const metadata: Metadata = {
  title: "상장폐지 위험 D-Day",
  description: `${SITE_NAME_KO} — 나스닥 Rule 5550(a)·(b) 상장 유지 기준 체크리스트`,
  alternates: { canonical: "/compliance" },
};

export default function CompliancePage() {
  return (
    <main>
      <ComplianceDdaySearch />
    </main>
  );
}
