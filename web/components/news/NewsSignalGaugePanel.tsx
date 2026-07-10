"use client";

import { useCallback, useEffect, useState } from "react";
import { SignalGauge } from "@/components/news/SignalGauge";
import { useSignalRealtime } from "@/hooks/use-signal-realtime";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  readSignalFromGeminiMetadata,
  type SignalStatus,
} from "@/lib/signal-status";

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

  /** SSR 캐시와 무관하게 마운트 시 gemini_metadata에서 최신 시그널 동기화 */
  useEffect(() => {
    let cancelled = false;

    async function syncFromDb() {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data, error } = await supabase
          .from("disclosures")
          .select("gemini_metadata")
          .eq("id", disclosureId)
          .maybeSingle();

        if (cancelled || error) {
          if (error) console.error("[signal-gauge] sync failed:", error.code, error.message);
          return;
        }

        const fromMeta = readSignalFromGeminiMetadata(
          data?.gemini_metadata as Record<string, unknown> | null | undefined
        );
        if (fromMeta) setStatus(fromMeta);
      } catch (err) {
        console.error("[signal-gauge] sync error:", err);
      }
    }

    void syncFromDb();
    return () => {
      cancelled = true;
    };
  }, [disclosureId]);

  return (
    <div className="mt-6 flex justify-center rounded-xl border border-border/80 bg-muted/20 px-4 py-6">
      <SignalGauge status={status} />
    </div>
  );
}
