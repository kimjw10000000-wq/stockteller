"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

type Row = { ticker: string; name: string; cik: string; exchange: string };

type ApiJson = {
  ok: boolean;
  error?: string;
  listA?: Row[];
  listB?: Row[];
  deactivated?: number;
  phase?: string;
  scannedDays?: number;
  totalDays?: number;
};

type Lists = { listA: Row[]; listB: Row[] };

type Job = {
  ticker: string;
  action: "ipo" | "rename" | "otc-remaining";
  phase: string;
  scannedDays?: number;
  totalDays?: number;
};

function phaseLabel(job: Job): string {
  if (job.phase === "polygon") return "polygon.io 검색 중…";
  if (job.phase === "edgar-ticker") return "EDGAR에서 서류 목록 검색 중…";
  if (job.phase === "edgar") {
    const n = job.scannedDays ?? 0;
    const total = job.totalDays ?? 120;
    return n > 0 ? `파일에서 찾는 중… (${n}/${total}일)` : "파일에서 찾는 중…";
  }
  if (job.phase === "save") return "저장 중…";
  if (job.phase === "rename") return "티커 변경 중…";
  if (job.phase === "otc") return "OTC 처리 중…";
  return "처리 중…";
}

export function AdminListingsPanel() {
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lists, setLists] = useState<Lists | null>(null);
  const [pickFor, setPickFor] = useState<string | null>(null);
  const [aQuery, setAQuery] = useState("");
  const [bQuery, setBQuery] = useState("");
  const [job, setJob] = useState<Job | null>(null);

  function applyJson(json: ApiJson) {
    setLists({
      listA: json.listA ?? [],
      listB: json.listB ?? [],
    });
    setPickFor(null);
  }

  async function parseRes(res: Response): Promise<ApiJson> {
    const text = await res.text();
    let json: ApiJson;
    try {
      json = JSON.parse(text) as ApiJson;
    } catch {
      throw new Error(
        res.status === 504
          ? "서버 시간 초과(504). 다시 눌러 주세요."
          : res.ok
            ? "서버가 JSON이 아닌 응답을 보냈습니다."
            : `서버 오류 (${res.status}). 목록을 불러오지 못했습니다.`
      );
    }
    if (!json.ok) throw new Error(json.error || "요청 실패");
    return json;
  }

  async function readIpoStream(res: Response): Promise<ApiJson> {
    if (!res.body) {
      return parseRes(res);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let last: ApiJson | null = null;
    for (;;) {
      const { done, value } = await reader.read();
      buf += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const raw = line.trim();
        if (!raw) continue;
        let json: ApiJson;
        try {
          json = JSON.parse(raw) as ApiJson;
        } catch {
          throw new Error("서버가 JSON이 아닌 응답을 보냈습니다.");
        }
        last = json;
        if (!json.ok) throw new Error(json.error || "요청 실패");
        if (json.phase && json.phase !== "done") {
          setJob((prev) =>
            prev
              ? {
                  ...prev,
                  phase: json.phase ?? prev.phase,
                  scannedDays: json.scannedDays,
                  totalDays: json.totalDays,
                }
              : prev
          );
        }
        if (json.phase === "done" || json.listA) {
          last = json;
        }
      }
      if (done) break;
    }
    if (!last) throw new Error("서버 응답이 비었습니다.");
    if (!last.ok) throw new Error(last.error || "요청 실패");
    return last;
  }

  async function post(body: Record<string, string>) {
    setBusy(true);
    setError(null);
    const action = (body.action ?? "") as Job["action"];
    setJob({
      ticker: body.ticker || body.to || "",
      action,
      phase: action === "ipo" ? "polygon" : action === "rename" ? "rename" : "otc",
    });
    const edgarHint =
      action === "ipo"
        ? window.setTimeout(() => {
            setJob((prev) =>
              prev?.phase === "polygon"
                ? { ...prev, phase: "edgar-ticker" }
                : prev
            );
          }, 2500)
        : 0;
    try {
      const res = await fetch("/api/admin/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 504) throw new Error("서버 시간 초과(504). 다시 눌러 주세요.");
      const json = action === "ipo" ? await readIpoStream(res) : await parseRes(res);
      applyJson(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (edgarHint) window.clearTimeout(edgarHint);
      setBusy(false);
      setJob(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/listings", { cache: "no-store" })
      .then(parseRes)
      .then((json) => {
        if (cancelled) return;
        applyJson(json);
        if (json.error && (json.listA ?? []).length === 0 && (json.listB ?? []).length === 0) {
          setError(json.error);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredA = useMemo(() => {
    const q = aQuery.trim().toUpperCase();
    if (!q || !lists) return lists?.listA ?? [];
    return lists.listA.filter((r) => r.ticker.includes(q) || r.name.toUpperCase().includes(q));
  }, [lists, aQuery]);

  const filteredB = useMemo(() => {
    const q = bQuery.trim().toUpperCase();
    if (!q || !lists) return lists?.listB ?? [];
    return lists.listB.filter((r) => r.ticker.includes(q) || r.name.toUpperCase().includes(q));
  }, [lists, bQuery]);

  function actionClass(active: boolean) {
    return active
      ? "rounded border border-primary bg-primary px-2 py-1 text-xs text-primary-foreground"
      : "rounded border border-border px-2 py-1 text-xs hover:bg-accent";
  }

  return (
    <div className="space-y-8">
      {loading ? <p className="text-sm text-muted-foreground">목록을 불러오는 중…</p> : null}
      {job ? (
        <p className="text-sm font-semibold text-primary" aria-live="polite">
          {job.ticker ? `${job.ticker} · ` : ""}
          {phaseLabel(job)}
        </p>
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {lists ? (
        <>
          <section>
            <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
              <h2 className="text-lg font-semibold">목록 A · 거래소에만 있음 ({lists.listA.length})</h2>
              <input
                value={aQuery}
                onChange={(e) => setAQuery(e.target.value)}
                placeholder="검색"
                className="rounded border border-border bg-background px-2 py-1 text-sm"
              />
            </div>
            <p className="mb-2 text-xs text-muted-foreground">신규상장하거나, 목록 B의 구티커로 티커변경합니다.</p>
            <ListTable
              rows={filteredA}
              empty="목록 A가 비어 있습니다."
              action={(row) => (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void post({ action: "ipo", ticker: row.ticker })}
                    className={actionClass(job?.action === "ipo" && job.ticker === row.ticker)}
                  >
                    신규상장
                  </button>
                  <button
                    type="button"
                    disabled={busy || lists.listB.length === 0}
                    onClick={() => {
                      setPickFor(row.ticker);
                      setBQuery("");
                    }}
                    className={actionClass(pickFor === row.ticker)}
                  >
                    티커변경
                  </button>
                </div>
              )}
            />
          </section>

          {pickFor ? (
            <section className="rounded-lg border border-primary/40 p-4">
              <h3 className="text-sm font-semibold">{pickFor} ← 목록 B에서 구티커 선택</h3>
              <p className="mt-1 text-xs text-muted-foreground">아래 목록 B에서 고르거나, 표에서 바로 고를 수 있습니다.</p>
              <button type="button" className="mt-2 text-xs text-muted-foreground" onClick={() => setPickFor(null)}>
                선택 취소
              </button>
            </section>
          ) : null}

          <section>
            <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
              <h2 className="text-lg font-semibold">목록 B · DB에만 있음 ({lists.listB.length})</h2>
              <input
                value={bQuery}
                onChange={(e) => setBQuery(e.target.value)}
                placeholder="검색"
                className="rounded border border-border bg-background px-2 py-1 text-sm"
              />
            </div>
            <p className="mb-2 text-xs text-muted-foreground">
              상장 유지인데 거래소 파일에는 없는 종목입니다. 티커변경 구티커로 쓰거나, 목록 A를 다 처리한 뒤 OTC로
              내립니다.
            </p>
            <ListTable
              rows={filteredB}
              empty="목록 B가 비어 있습니다."
              action={
                pickFor
                  ? (row) => (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void post({ action: "rename", from: row.ticker, to: pickFor })}
                        className="rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground"
                      >
                        이 종목으로 변경
                      </button>
                    )
                  : undefined
              }
            />
            <button
              type="button"
              disabled={busy || lists.listA.length > 0 || lists.listB.length === 0}
              onClick={() => void post({ action: "otc-remaining" })}
              className="mt-3 rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-50"
            >
              남은 B OTC 처리
            </button>
          </section>
        </>
      ) : null}
    </div>
  );
}

function ListTable({
  rows,
  empty,
  action,
}: {
  rows: Row[];
  empty: string;
  action?: (row: Row) => ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2">티커</th>
            <th className="px-3 py-2">이름</th>
            <th className="px-3 py-2">거래소</th>
            {action ? <th className="px-3 py-2">처리</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="px-3 py-4 text-muted-foreground" colSpan={action ? 4 : 3}>
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.ticker} className="border-t border-border">
                <td className="px-3 py-2 font-mono">{row.ticker}</td>
                <td className="px-3 py-2">{row.name}</td>
                <td className="px-3 py-2">{row.exchange}</td>
                {action ? <td className="px-3 py-2">{action(row)}</td> : null}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
