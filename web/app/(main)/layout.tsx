import { AdBannerSlot } from "@/components/layout/AdBannerSlot";
import { SiteHeader } from "@/components/layout/SiteHeader";

export default function MainSiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <AdBannerSlot />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</div>
    </div>
  );
}
