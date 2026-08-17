import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { ADSENSE_CLIENT, getSiteUrl } from "@/lib/site";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

const SITE_TITLE = "왜올라 (whyup) - 주식 종목 분석 및 투자 리포트 플랫폼";
const SITE_DESCRIPTION =
  "종목이 왜 올라가는지 철저하게 분석합니다. 개인 투자자를 위한 실시간 공시 분석, 종목 리포트 및 투자 시그널 제공.";

/** 모바일에서 1.0 미만 축소(핀치 아웃)로 우측 여백이 생기는 현상 방지 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 5,
  userScalable: true,
};

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
  other: {
    "google-adsense-account": ADSENSE_CLIENT,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <Script
          id="adsense"
          async
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
          crossOrigin="anonymous"
          strategy="beforeInteractive"
        />
      </head>
      <body className={`${inter.variable} min-h-screen bg-background font-sans antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
