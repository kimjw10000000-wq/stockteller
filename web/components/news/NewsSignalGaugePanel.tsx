"use client";

import { useCallback, useState } from "react";
import { SignalGauge } from "@/components/news/SignalGauge";
import { useSignalRealtime } from "@/hooks/use-signal-realtime";
import type { SignalStatus } from "@/lib/signal-status";

type NewsSignalGaugePanelProps = {
  disclosureId: string;
  initialStatus: SignalStatus;
};

export function NewsSignalGaugePanel({ disclosureId, initialStatus }: NewsSignalGaugePanelProps) {
  const [status, setStatus] = useState<SignalStatus>(initialStatus);

  const onRealtime = useCallback((next: SignalStatus) => {
    setStatus(next);
  }, []);

  useSignalRealtime(disclosureId, onRealtime);

  return (
    <div className="mt-6 flex justify-center rounded-xl border border-border/80 bg-muted/20 px-4 py-6">
      <SignalGauge status={status} />
    </div>
  );
}
