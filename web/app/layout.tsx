import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { getSiteUrl } from "@/lib/site";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

const SITE_TITLE = "왜올라 (whyup) - 주식 종목 분석 및 투자 리포트 플랫폼";
const SITE_DESCRIPTION =
  "종목이 왜 올라가는지 철저하게 분석합니다. 개인 투자자를 위한 실시간 공시 분석, 종목 리포트 및 투자 시그널 제공.";

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: {
    default: SITE_TITLE,
    template: "%s | 왜올라 (whyup)",
  },
  description: SITE_DESCRIPTION,
  keywords: ["왜올라", "whyup", "whyup.net", "주식 분석", "종목 리포트", "투자 시그널"],
  applicationName: "whyup",
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "왜올라 (whyup)",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={`${inter.variable} min-h-screen bg-background font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
