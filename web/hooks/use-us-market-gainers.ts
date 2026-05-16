"use client";

import { useCallback, useEffect, useState } from "react";
import type { UsDayGainerQuote } from "@/lib/us-market/us-day-gainer-types";
import {
  buildAllYahooDayGainersUrls,
  parseYahooDayGainersJson,
} from "@/lib/us-market/yahoo-screener-parse";

export type UsGainersClientSource = "yahoo-browser" | "yahoo-api" | "alphavantage" | null;

const VERCEL_HELP_KO =
  "Vercel에서는 Yahoo가 서버·브라우저(CORS) 모두 막히는 경우가 많습니다. Vercel 대시보드 → 프로젝트 → Settings → Environment Variables에 ALPHA_VANTAGE_API_KEY(무료 발급)를 넣고 Redeploy 하세요. localhost는 집 IP라 Yahoo가 열릴 수 있어 차이가 납니다.";

/**
 * 1) `/api/us-day-gainers` — Yahoo 스크리너 + 서버에 FINNHUB_API_KEY 있으면 Finnhub 등락(dp) 보정(틱 단위 실시간은 아님).
 * 2) 그다음 브라우저 Yahoo(CORS 허용 시) — AV 전일 스냅샷보다 우선할 수 있음.
 */
export function useUsMarketGainers(minPct: number, pollMs: number) {
  const [items, setItems] = useState<UsDayGainerQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [source, setSource] = useState<UsGainersClientSource>(null);
  const [delayedMarketSnapshot, setDelayedMarketSnapshot] = useState(false);
  const [finnhubQuoteRefined, setFinnhubQuoteRefined] = useState(false);

  const load = useCallback(async () => {
    let apiErr: string | null = null;
    let avConfigured: boolean | undefined;
    let apiList: UsDayGainerQuote[] = [];
    let apiSource: string | undefined;
    let apiDelayed = false;
    let apiFinnhubRefined = false;

    try {
      const res = await fetch(`/api/us-day-gainers?minPct=${minPct}`, { cache: "no-store" });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t.slice(0, 240) || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        items?: UsDayGainerQuote[];
        source?: string;
        alphavantageConfigured?: boolean;
        delayedMarketSnapshot?: boolean;
        finnhubQuoteRefined?: boolean;
      };
      avConfigured = data.alphavantageConfigured;
      apiList = data.items ?? [];
      apiSource = data.source;
      apiDelayed = data.delayedMarketSnapshot === true;
      apiFinnhubRefined = data.finnhubQuoteRefined === true;

      if (apiList.length === 0 && data.alphavantageConfigured === false) {
        apiErr =
          "서버에 ALPHA_VANTAGE_API_KEY가 없어 Yahoo 위주로만 채웁니다. Vercel 환경 변수를 넣으면 소스가 늘어납니다.";
      }
    } catch (e) {
      apiErr = e instanceof Error ? e.message : "API 오류";
    }

    const skipBrowserYahoo = apiSource === "yahoo" && apiList.length > 0;

    if (!skipBrowserYahoo) {
      for (const url of buildAllYahooDayGainersUrls()) {
        try {
          const yahooRes = await fetch(url, { cache: "no-store" });
          if (yahooRes.ok) {
            const json = await yahooRes.json();
            const parsed = parseYahooDayGainersJson(json, minPct);
            if (parsed.length > 0) {
              setItems(parsed);
              setSource("yahoo-browser");
              setDelayedMarketSnapshot(false);
              setFinnhubQuoteRefined(false);
              setErr(null);
              return;
            }
          }
        } catch {
          /* CORS 등 */
        }
      }
    }

    if (apiList.length > 0) {
      const src: UsGainersClientSource =
        apiSource === "alphavantage"
          ? "alphavantage"
          : apiSource === "yahoo"
            ? "yahoo-api"
            : "yahoo-api";
      setItems(apiList);
      setSource(src);
      setDelayedMarketSnapshot(apiDelayed);
      setFinnhubQuoteRefined(apiFinnhubRefined);
      setErr(null);
      return;
    }

    setItems([]);
    setSource(null);
    setDelayedMarketSnapshot(false);
    setFinnhubQuoteRefined(false);
    setErr(
      apiErr ??
        (avConfigured === true
          ? "+20% 이상인데도 목록이 비면 장세·데이터 지연·API 제한일 수 있습니다. 잠시 후 새로고침 해 보세요."
          : VERCEL_HELP_KO)
    );
  }, [minPct]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      await load();
      if (!cancelled) setLoading(false);
    };
    void run();
    const iv = setInterval(() => void load(), pollMs);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [load, pollMs]);

  return { items, loading, err, source, delayedMarketSnapshot, finnhubQuoteRefined };
}
