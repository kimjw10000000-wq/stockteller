"use client";

import { useCallback, useEffect, useState } from "react";
import { SignalGauge } from "@/components/news/SignalGauge";
import { useSignalRealtime } from "@/hooks/use-signal-realtime";
import type { StockMatchContext } from "@/lib/stock-signal-sync";
import type { SignalStatus } from "@/lib/signal-status";

type NewsSignalGaugePanelProps = {
  stockContext: StockMatchContext | null;
  initialStatus: SignalStatus;
  disclosureId?: string;
};

/**
 * 읽기 전용 계기판:
 * - SSR이 DB에서 읽은 initialStatus만 표시
 * - 관리자 UPDATE Realtime 시에만 갱신
 * - 마운트 시 재조회/재계산/쓰기 없음 (DB 오염 방지)
 */
export function NewsSignalGaugePanel({
  stockContext,
  initialStatus,
  disclosureId,
}: NewsSignalGaugePanelProps) {
  const [status, setStatus] = useState<SignalStatus>(initialStatus);

  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus, disclosureId]);

  const onRealtime = useCallback((next: SignalStatus) => {
    setStatus(next);
  }, []);

  useSignalRealtime(stockContext, onRealtime);

  return (
    <div className="mt-6 flex justify-center rounded-xl border border-border/80 bg-muted/20 px-4 py-6">
      <SignalGauge status={status} />
    </div>
  );
}
