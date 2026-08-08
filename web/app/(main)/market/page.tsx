import type { Metadata } from "next";
import { StockQuoteChart } from "@/components/market/StockQuoteChart";
import { SITE_NAME_KO } from "@/lib/site";

export const metadata: Metadata = {
  title: "시세 · 차트",
  description: `${SITE_NAME_KO} — 실시간 주가 및 일봉 차트`,
  alternates: { canonical: "/market" },
};

export default function MarketPage() {
  return (
    <main>
      <p className="text-sm font-medium text-muted-foreground">Market · Quote</p>
      <h1 className="mt-1 text-2xl font-semibold text-foreground sm:text-3xl">시세 · 차트</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
        토스증권 Open API가 설정되면 시세·캔들을 토스에서 가져옵니다. 키가 없으면 Finnhub로
        폴백합니다.
      </p>
      <StockQuoteChart defaultSymbol="AAPL" />
    </main>
  );
}
