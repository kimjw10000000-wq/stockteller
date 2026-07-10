"use client";

import { useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  readSignalFromGeminiMetadata,
  type SignalStatus,
} from "@/lib/signal-status";

/** 뉴스 상세 — gemini_metadata.signal_status UPDATE 실시간 구독 */
export function useSignalRealtime(
  disclosureId: string,
  onStatusChange: (status: SignalStatus) => void
) {
  useEffect(() => {
    let supabase: ReturnType<typeof createSupabaseBrowserClient>;
    try {
      supabase = createSupabaseBrowserClient();
    } catch {
      return;
    }

    async function fetchSignalFromDb(): Promise<SignalStatus | null> {
      const { data, error } = await supabase
        .from("disclosures")
        .select("gemini_metadata")
        .eq("id", disclosureId)
        .maybeSingle();

      if (error) {
        console.error("[signal-realtime] fetch failed:", error.code, error.message);
        return null;
      }

      return readSignalFromGeminiMetadata(
        data?.gemini_metadata as Record<string, unknown> | null | undefined
      );
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
          const row = payload.new as { gemini_metadata?: Record<string, unknown> | null };
          const fromPayload = readSignalFromGeminiMetadata(row.gemini_metadata);
          if (fromPayload) {
            onStatusChange(fromPayload);
            return;
          }
          void fetchSignalFromDb().then((status) => {
            if (status) onStatusChange(status);
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [disclosureId, onStatusChange]);
}
