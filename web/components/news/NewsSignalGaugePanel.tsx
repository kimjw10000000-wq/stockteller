"use client";

import { useCallback, useEffect, useState } from "react";
import { SignalGauge } from "@/components/news/SignalGauge";
import { useSignalRealtime } from "@/hooks/use-signal-realtime";
import { getSignalStatusForStockCode } from "@/lib/stock-signal-sync";
import type { SignalStatus } from "@/lib/signal-status";

type NewsSignalGaugePanelProps = {
  stockCode: string | null;
  initialStatus: SignalStatus;
};

export function NewsSignalGaugePanel({ stockCode, initialStatus }: NewsSignalGaugePanelProps) {
  const [status, setStatus] = useState<SignalStatus>(initialStatus);

  const onRealtime = useCallback((next: SignalStatus) => {
    setStatus(next);
  }, []);

  useSignalRealtime(stockCode, onRealtime);

  /** 종목코드 기준 최신 시그널 동기화 */
  useEffect(() => {
    if (!stockCode) return;
    let cancelled = false;

    async function syncFromStock() {
      try {
        const next = await getSignalStatusForStockCode(stockCode!);
        if (!cancelled) setStatus(next);
      } catch (err) {
        console.error("[signal-gauge] stock sync error:", err);
      }
    }

    void syncFromStock();
    return () => {
      cancelled = true;
    };
  }, [stockCode]);

  return (
    <div className="mt-6 flex justify-center rounded-xl border border-border/80 bg-muted/20 px-4 py-6">
      <SignalGauge status={status} />
    </div>
  );
}
