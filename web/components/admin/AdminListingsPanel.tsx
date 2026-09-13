"use client";

import { useEffect, useMemo, useState } from "react";

type Row = { ticker: string; name: string; cik: string; exchange: string };

type Paired = { ticker: string; name: string; exchange: string; parentTicker: string };

type ScanState = {
  traderCount: number;
  matched: number;
  listA: Row[];
  listB: Row[];
  aliases: Array<{ oldTicker: string; newTicker: string }>;
  prunedAliases: string[];
  listBPick?: Row[];
  inheritedJuniors?: number;
  pairedJuniors?: Paired[];
  moreWork?: boolean;
};

type ApiJson = ScanState & { ok: boolean; error?: string; deactivated?: number };

export function AdminListingsPanel() {
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<ScanState | null>(null);
  const [pickFor, setPickFor] = useState<string | null>(null);
  const [bQuery, setBQuery] = useState("");
  const [aQuery, setAQuery] = useState("");

  function applyJson(json: ApiJson) {
    setState({
      traderCount: json.traderCount,
      matched: json.matched ?? 0,
      listA: json.listA,
      listB: json.listB,
      listBPick: json.listBPick ?? json.listB,
      aliases: json.aliases,
      prunedAliases: json.prunedAliases ?? [],
      inheritedJuniors: json.inheritedJuniors ?? 0,
      pairedJuniors: json.pairedJuniors ?? [],
      moreWork: json.moreWork ?? false,
    });
    setPickFor(null);
  }

  async function request(body: Record<string, string>): Promise<ApiJson> {
    const res = await fetch("/api/admin/listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json: ApiJson;
    try {
      json = JSON.parse(text) as ApiJson;
    } catch {
      throw new Error(
        res.ok
          ? "서버가 JSON이 아닌 응답을 보냈습니다."
          : `서버 오류 (${res.status}). 업데이트가 너무 오래 걸렸을 수 있습니다.`
      );
    }
    if (!json.ok) throw new Error(json.error || "요청 실패");
    return json;
  }

  async function post(body: Record<string, string>) {
    setBusy(true);
    setPhase("running");
    setError(null);
    try {
      applyJson(await request(body));
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("idle");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setPhase("running");
    fetch("/api/admin/listings", { cache: "no-store" })
      .then(async (res) => {
        const text = await res.text();
        const json = JSON.parse(text) as ApiJson;
        if (!json.ok) throw new Error(json.error || "목록을 불러오지 못했습니다.");
        if (!cancelled) {
          applyJson(json);
          setPhase("done");
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setPhase("idle");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredA = useMemo(() => {
    const q = aQuery.trim().toUpperCase();
    if (!q || !state) return state?.listA ?? [];
    return state.listA.filter((r) => r.ticker.includes(q) || r.name.toUpperCase().includes(q));
  }, [state, aQuery]);

  const filteredB = useMemo(() => {
    const q = bQuery.trim().toUpperCase();
    if (!q || !state) return state?.listBPick ?? [];
    return (state.listBPick ?? []).filter((r) => r.ticker.includes(q) || r.name.toUpperCase().includes(q));
  }, [state, bQuery]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={
            busy ||
            !state ||
            state.listA.length > 0 ||
            (state.pairedJuniors?.length ?? 0) > 0 ||
            state.listB.length === 0
          }
          onClick={() => void post({ action: "otc-remaining" })}
          className="rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-50"
        >
          남은 B OTC 처리
        </button>
      </div>

      <p
        className={
          phase === "running"
            ? "text-sm font-semibold text-foreground"
            : phase === "done"
              ? "text-sm font-semibold text-emerald-700 dark:text-emerald-400"
              : "text-sm text-muted-foreground"
        }
        aria-live="polite"
      >
        {phase === "running" ? "진행중입니다" : phase === "done" ? "완료했습니다" : "대기 중"}
      </p>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {state ? (
        <p className="text-sm text-muted-foreground">
          거래소 {state.traderCount}개 · 같은 티커 CIK 유지 {state.matched}개 · 워런트·우선주 상속{" "}
          {state.inheritedJuniors ?? 0}개 · 동시상장 대기 {state.pairedJuniors?.length ?? 0}개 · 목록 A{" "}
          {state.listA.length}개 · 목록 B {state.listB.length}개
          {state.prunedAliases.length ? ` · 구티커 해제 ${state.prunedAliases.join(", ")}` : ""}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">거래소 파일 대조는 이 화면이 아니라 Cursor에서 프로그램을 돌립니다.</p>
      )}

      {state && state.aliases.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold">변경전 티커</h2>
          <ul className="flex flex-wrap gap-2 text-xs">
            {state.aliases.map((a) => (
              <li key={a.oldTicker} className="rounded border border-border px-2 py-1">
                {a.oldTicker} → {a.newTicker}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {state && (state.pairedJuniors?.length ?? 0) > 0 ? (
        <section className="rounded-lg border border-border p-4 text-sm">
          <h2 className="mb-2 font-semibold">동시상장 워런트·우선주</h2>
          <p className="mb-3 text-muted-foreground">
            일반주와 같은 날 파일에 올라온 종목입니다. 목록 A에서 일반주를 신규상장 또는 티커변경하면 같은 CIK로
            자동 저장됩니다.
          </p>
          <ul className="space-y-1 font-mono text-xs">
            {(state.pairedJuniors ?? []).map((row) => (
              <li key={row.ticker}>
                {row.ticker} ← {row.parentTicker}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {state ? (
        <section>
          <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-lg font-semibold">목록 A · 거래소에만 있음</h2>
            <input
              value={aQuery}
              onChange={(e) => setAQuery(e.target.value)}
              placeholder="검색"
              className="rounded border border-border bg-background px-2 py-1 text-sm"
            />
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">티커</th>
                  <th className="px-3 py-2">이름</th>
                  <th className="px-3 py-2">거래소</th>
                  <th className="px-3 py-2">처리</th>
                </tr>
              </thead>
              <tbody>
                {filteredA.map((row) => (
                  <tr key={row.ticker} className="border-t border-border">
                    <td className="px-3 py-2 font-mono">{row.ticker}</td>
                    <td className="px-3 py-2">{row.name}</td>
                    <td className="px-3 py-2">{row.exchange}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void post({ action: "ipo", ticker: row.ticker })}
                          className="rounded border border-border px-2 py-1 text-xs hover:bg-accent"
                        >
                          신규상장
                        </button>
                        <button
                          type="button"
                          disabled={busy || (state.listBPick ?? []).length === 0}
                          onClick={() => {
                            setPickFor(row.ticker);
                            setBQuery("");
                          }}
                          className="rounded border border-border px-2 py-1 text-xs hover:bg-accent"
                        >
                          티커변경
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {pickFor && state ? (
        <section className="rounded-lg border border-primary/40 p-4">
          <h3 className="text-sm font-semibold">
            {pickFor} ← 목록 B에서 구티커 선택
          </h3>
          <input
            value={bQuery}
            onChange={(e) => setBQuery(e.target.value)}
            placeholder="구티커 검색"
            className="mt-2 w-full max-w-sm rounded border border-border bg-background px-2 py-1 text-sm"
          />
          <ul className="mt-3 max-h-64 overflow-auto text-sm">
            {filteredB.map((row) => (
              <li key={row.ticker} className="flex items-center justify-between border-b border-border py-1">
                <span>
                  <span className="font-mono">{row.ticker}</span> {row.name}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void post({ action: "rename", from: row.ticker, to: pickFor })}
                  className="rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground"
                >
                  이 종목으로 변경
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="mt-2 text-xs text-muted-foreground" onClick={() => setPickFor(null)}>
            닫기
          </button>
        </section>
      ) : null}

      {state && state.listB.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          목록 B {state.listB.length}개(상장 유지 중인데 파일에 없음)는 화면에 안 띄웁니다. 티커변경을 누르면
          OTC로 내려간 구티커까지 고를 수 있습니다. 목록 A를 다 처리한 뒤 「남은 B OTC 처리」를 누르면 상장폐지로
          내립니다.
        </p>
      ) : null}
    </div>
  );
}
