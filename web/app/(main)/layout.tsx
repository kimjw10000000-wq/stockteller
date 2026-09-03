import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";

export default function MainSiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="relative z-10 flex min-h-screen w-full max-w-[100vw] flex-col overflow-x-hidden">
      <SiteHeader />
      <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">{children}</div>
      <SiteFooter />
    </div>
  );
}
