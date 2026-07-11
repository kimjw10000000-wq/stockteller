"use client";

import { useCallback, useEffect, useState } from "react";
import { SignalGauge } from "@/components/news/SignalGauge";
import { useSignalRealtime } from "@/hooks/use-signal-realtime";
import {
  getSignalStatusForStockIdentity,
  stockIdentityHasKeys,
  stockIdentityKey,
  type StockIdentity,
} from "@/lib/stock-signal-sync";
import type { SignalStatus } from "@/lib/signal-status";

type NewsSignalGaugePanelProps = {
  stockIdentity: StockIdentity | null;
  initialStatus: SignalStatus;
};

export function NewsSignalGaugePanel({ stockIdentity, initialStatus }: NewsSignalGaugePanelProps) {
  const [status, setStatus] = useState<SignalStatus>(initialStatus);
  const identityKey = stockIdentity ? stockIdentityKey(stockIdentity) : null;

  const onRealtime = useCallback((next: SignalStatus) => {
    setStatus(next);
  }, []);

  useSignalRealtime(stockIdentity, onRealtime);

  /** 종목코드 · 주식이름 · 티커 OR 기준 최신 시그널 동기화 */
  useEffect(() => {
    if (!stockIdentity || !stockIdentityHasKeys(stockIdentity)) return;
    let cancelled = false;

    async function syncFromStock() {
      try {
        const next = await getSignalStatusForStockIdentity(stockIdentity!);
        if (!cancelled) setStatus(next);
      } catch (err) {
        console.error("[signal-gauge] stock sync error:", err);
      }
    }

    void syncFromStock();
    return () => {
      cancelled = true;
    };
  }, [identityKey, stockIdentity]);

  return (
    <div className="mt-6 flex justify-center rounded-xl border border-border/80 bg-muted/20 px-4 py-6">
      <SignalGauge status={status} />
    </div>
  );
}
