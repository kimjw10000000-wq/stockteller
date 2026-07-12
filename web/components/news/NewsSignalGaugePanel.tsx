"use client";

import { useCallback, useEffect, useState } from "react";
import { SignalGauge } from "@/components/news/SignalGauge";
import { useSignalRealtime } from "@/hooks/use-signal-realtime";
import {
  getSignalStatusForStockContext,
  matchContextIsComplete,
  stockIdentityKey,
  type StockMatchContext,
} from "@/lib/stock-signal-sync";
import type { SignalStatus } from "@/lib/signal-status";

type NewsSignalGaugePanelProps = {
  stockContext: StockMatchContext | null;
  initialStatus: SignalStatus;
  disclosureId?: string;
};

export function NewsSignalGaugePanel({
  stockContext,
  initialStatus,
  disclosureId,
}: NewsSignalGaugePanelProps) {
  const [status, setStatus] = useState<SignalStatus>(initialStatus);
  const contextKey = stockContext ? stockIdentityKey(stockContext) : null;

  const onRealtime = useCallback((next: SignalStatus) => {
    setStatus(next);
  }, []);

  useSignalRealtime(stockContext, onRealtime);

  /** KR: 코드+이름 / US: 티커+이름 기준 최신 시그널 동기화 */
  useEffect(() => {
    if (!stockContext || !matchContextIsComplete(stockContext)) return;
    let cancelled = false;

    async function syncFromStock() {
      try {
        const next = await getSignalStatusForStockContext(stockContext!, disclosureId);
        if (!cancelled) setStatus(next);
      } catch (err) {
        console.error("[signal-gauge] stock sync error:", err);
      }
    }

    void syncFromStock();
    return () => {
      cancelled = true;
    };
  }, [contextKey, stockContext, disclosureId]);

  return (
    <div className="mt-6 flex justify-center rounded-xl border border-border/80 bg-muted/20 px-4 py-6">
      <SignalGauge status={status} />
    </div>
  );
}
