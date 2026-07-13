"use client";

import { useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  readSignalFromGeminiMetadata,
  type SignalStatus,
} from "@/lib/signal-status";
import {
  matchContextIsComplete,
  rowMatchesStockContext,
  stockIdentityKey,
  type StockMatchContext,
} from "@/lib/stock-signal-sync";

/**
 * 읽기 전용 Realtime — DB UPDATE payload의 signal_status만 반영.
 * 재조회·재계산·쓰기 API 호출 없음.
 */
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
            id?: string;
            stock_code?: string | null;
            stock_name?: string | null;
            gemini_metadata?: Record<string, unknown> | null;
            stocks?: { name?: string | null; ticker?: string | null } | null;
          };

          const fromPayload = readSignalFromGeminiMetadata(row.gemini_metadata);
          if (!fromPayload) return;

          if (rowMatchesStockContext(row, stockContext!)) {
            onStatusChange(fromPayload);
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [contextKey, stockContext, onStatusChange]);
}
