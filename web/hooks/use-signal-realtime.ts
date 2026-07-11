"use client";

import { useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  readSignalFromGeminiMetadata,
  type SignalStatus,
} from "@/lib/signal-status";
import {
  getSignalStatusForStockIdentity,
  rowMatchesStockIdentity,
  stockIdentityHasKeys,
  stockIdentityKey,
  type StockIdentity,
} from "@/lib/stock-signal-sync";

/** 종목코드 · 주식이름 · 티커 OR — 동일 종목 disclosures UPDATE 실시간 구독 */
export function useSignalRealtime(
  stockIdentity: StockIdentity | null,
  onStatusChange: (status: SignalStatus) => void
) {
  const identityKey = stockIdentity ? stockIdentityKey(stockIdentity) : null;

  useEffect(() => {
    if (!stockIdentity || !stockIdentityHasKeys(stockIdentity)) return;

    let supabase: ReturnType<typeof createSupabaseBrowserClient>;
    try {
      supabase = createSupabaseBrowserClient();
    } catch {
      return;
    }

    async function fetchSignalForStock(): Promise<SignalStatus | null> {
      try {
        return await getSignalStatusForStockIdentity(stockIdentity!);
      } catch (err) {
        console.error("[signal-realtime] stock fetch failed:", err);
        return null;
      }
    }

    const channel = supabase
      .channel(`stock-signal-${identityKey}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "disclosures",
        },
        (payload) => {
          const row = payload.new as {
            stock_code?: string | null;
            stock_name?: string | null;
            gemini_metadata?: Record<string, unknown> | null;
            stocks?: { name?: string | null; ticker?: string | null } | null;
          };

          if (!rowMatchesStockIdentity(row, stockIdentity!)) return;

          const fromPayload = readSignalFromGeminiMetadata(row.gemini_metadata);
          if (fromPayload) {
            onStatusChange(fromPayload);
            return;
          }
          void fetchSignalForStock().then((status) => {
            if (status) onStatusChange(status);
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [identityKey, stockIdentity, onStatusChange]);
}
