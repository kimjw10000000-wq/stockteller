"use client";

import { useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  readSignalFromGeminiMetadata,
  type SignalStatus,
} from "@/lib/signal-status";
import {
  getSignalStatusForStockContext,
  matchContextIsComplete,
  rowMatchesStockContext,
  stockIdentityKey,
  type StockMatchContext,
} from "@/lib/stock-signal-sync";

/** KR: 코드+이름 / US: 티커+이름 — 동일 종목 disclosures UPDATE 실시간 구독 */
export function useSignalRealtime(
  stockContext: StockMatchContext | null,
  onStatusChange: (status: SignalStatus) => void
) {
  const contextKey = stockContext ? stockIdentityKey(stockContext) : null;

  useEffect(() => {
    if (!stockContext || !matchContextIsComplete(stockContext)) return;

    let supabase: ReturnType<typeof createSupabaseBrowserClient>;
    try {
      supabase = createSupabaseBrowserClient();
    } catch {
      return;
    }

    async function fetchSignalForStock(): Promise<SignalStatus | null> {
      try {
        return await getSignalStatusForStockContext(stockContext!);
      } catch (err) {
        console.error("[signal-realtime] stock fetch failed:", err);
        return null;
      }
    }

    const channel = supabase
      .channel(`stock-signal-${contextKey}`)
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

          if (!rowMatchesStockContext(row, stockContext!)) return;

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
  }, [contextKey, stockContext, onStatusChange]);
}
