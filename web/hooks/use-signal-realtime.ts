"use client";

import { useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { isSignalStatus, type SignalStatus } from "@/lib/signal-status";

/** 뉴스 상세 — disclosures.signal_status UPDATE 실시간 구독 */
export function useSignalRealtime(
  disclosureId: string,
  onStatusChange: (status: SignalStatus) => void
) {
  useEffect(() => {
    let supabase;
    try {
      supabase = createSupabaseBrowserClient();
    } catch {
      return;
    }

    const channel = supabase
      .channel(`disclosure-signal-${disclosureId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "disclosures",
          filter: `id=eq.${disclosureId}`,
        },
        (payload) => {
          const row = payload.new as {
            signal_status?: unknown;
            gemini_metadata?: { signal_status?: unknown } | null;
          };
          if (isSignalStatus(row.signal_status)) {
            onStatusChange(row.signal_status);
            return;
          }
          if (isSignalStatus(row.gemini_metadata?.signal_status)) {
            onStatusChange(row.gemini_metadata.signal_status);
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [disclosureId, onStatusChange]);
}
