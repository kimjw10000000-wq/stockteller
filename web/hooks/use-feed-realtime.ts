"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/** disclosures INSERT 시 /feed 서버 데이터 갱신 (Realtime) */
export function useFeedRealtime() {
  const router = useRouter();

  useEffect(() => {
    let supabase;
    try {
      supabase = createSupabaseBrowserClient();
    } catch {
      return;
    }

    const channel = supabase
      .channel("feed-disclosures-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "disclosures" },
        () => {
          router.refresh();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router]);
}
