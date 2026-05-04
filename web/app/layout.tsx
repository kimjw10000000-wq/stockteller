import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import {
  SITE_NAME_EN,
  SITE_NAME_KO,
  SITE_TAGLINE,
  getSiteUrl,
} from "@/lib/site";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: {
    default: `${SITE_NAME_KO} · ${SITE_NAME_EN}`,
    template: `%s | ${SITE_NAME_KO}`,
  },
  description: SITE_TAGLINE,
  keywords: ["왜 올라", "Whyup", "whyup", "공시 요약", "SEC", "나스닥", "AI 공시"],
  applicationName: SITE_NAME_EN,
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: `${SITE_NAME_KO} (${SITE_NAME_EN})`,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={`${inter.variable} min-h-screen bg-[#f7f9fc] font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
