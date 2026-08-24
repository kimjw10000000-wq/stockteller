"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bell, Loader2, Plus } from "lucide-react";
import { FREE_ALERT_SLOT_LIMIT } from "@/lib/alerts/plan";
import { getAlertStatus } from "@/lib/alerts/status";
import type { AlertsPayload, DilutionAlertDto } from "@/lib/alerts/types";
import { AlertCard } from "./AlertCard";
import type { TickerHit } from "./AlertTickerSearch";
import { UpgradeModal } from "./UpgradeModal";

const GUEST_SLOT: DilutionAlertDto = {
  id: "guest-slot",
  ticker: null,
  companyName: null,
  enabled: false,
  lastTriggeredAt: null,
  createdAt: new Date(0).toISOString(),
  status: "inactive",
};

function withLiveStatus(alert: DilutionAlertDto, isPro: boolean): DilutionAlertDto {
  return {
    ...alert,
    status: getAlertStatus({
      enabled: alert.enabled,
      ticker: alert.ticker,
      isPro,
      lastTriggeredAt: alert.lastTriggeredAt,
    }),
  };
}

export function AlertsDashboard() {
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [alerts, setAlerts] = useState<DilutionAlertDto[]>([GUEST_SLOT]);
  const [error, setError] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [missingTable, setMissingTable] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/alerts", { cache: "no-store" });
      if (res.status === 401) {
        setAuthed(false);
        setIsPro(false);
        setAlerts([GUEST_SLOT]);
        setMissingTable(false);
        return;
      }
      const j = (await res.json()) as AlertsPayload & { ok?: boolean; error?: string };
      if (res.status === 503 || j.error === "alerts_table_missing") {
        setMissingTable(true);
        setAuthed(true);
        setError("알람 저장소가 아직 준비되지 않았습니다. 관리자가 마이그레이션을 실행해야 합니다.");
        return;
      }
      if (!res.ok) {
        setError("알람을 불러오지 못했습니다.");
        return;
      }
      setAuthed(true);
      setMissingTable(false);
      setIsPro(j.isPro);
      setAlerts(j.alerts.length > 0 ? j.alerts : j.isPro ? [] : [GUEST_SLOT]);
    } catch {
      setError("알람을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = window.setInterval(() => {
      setAlerts((prev) => prev.map((a) => withLiveStatus(a, isPro)));
    }, 30_000);
    return () => window.clearInterval(t);
  }, [isPro]);

  async function patchAlert(id: string, body: Record<string, unknown>) {
    if (!authed || id === GUEST_SLOT.id) {
      if (id === GUEST_SLOT.id && body.ticker) {
        const ticker = String(body.ticker);
        const companyName = typeof body.companyName === "string" ? body.companyName : null;
        setAlerts([
          withLiveStatus(
            {
              ...GUEST_SLOT,
              ticker,
              companyName,
              enabled: false,
            },
            false
          ),
        ]);
      }
      if (id === GUEST_SLOT.id && typeof body.enabled === "boolean") {
        setAlerts((prev) =>
          prev.map((a) => {
            if (a.id !== id) return a;
            if (body.enabled && !a.ticker) return a;
            return withLiveStatus({ ...a, enabled: body.enabled as boolean }, false);
          })
        );
      }
      return;
    }

    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/alerts/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as { ok?: boolean; alert?: DilutionAlertDto; error?: string };
      if (res.status === 400 && j.error === "ticker_required") {
        setError("종목을 먼저 선택한 뒤 알람을 켜 주세요.");
        return;
      }
      if (res.status === 409) {
        setError("이미 같은 티커 알람이 있습니다.");
        return;
      }
      if (!res.ok || !j.alert) {
        setError("저장하지 못했습니다.");
        return;
      }
      setAlerts((prev) => prev.map((a) => (a.id === id ? j.alert! : a)));
    } catch {
      setError("저장하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function addAlert() {
    if (!isPro) {
      setUpgradeOpen(true);
      return;
    }
    if (!authed) {
      setUpgradeOpen(true);
      return;
    }
    setBusyId("new");
    setError(null);
    try {
      const res = await fetch("/api/alerts", { method: "POST" });
      const j = (await res.json()) as {
        ok?: boolean;
        alert?: DilutionAlertDto;
        error?: string;
      };
      if (res.status === 403 || j.error === "upgrade_required") {
        setUpgradeOpen(true);
        return;
      }
      if (!res.ok || !j.alert) {
        setError("알람을 추가하지 못했습니다.");
        return;
      }
      setAlerts((prev) => [...prev, j.alert!]);
    } catch {
      setError("알람을 추가하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteAlert(id: string) {
    if (!isPro) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/alerts/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setError("삭제하지 못했습니다.");
        return;
      }
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch {
      setError("삭제하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  const visible = authed
    ? isPro
      ? alerts
      : alerts.slice(0, FREE_ALERT_SLOT_LIMIT)
    : [alerts[0] ?? GUEST_SLOT];

  return (
    <div className="mx-auto w-full max-w-md">
      <header className="mb-6">
        <p className="flex items-center gap-2 text-sm font-medium text-emerald-400">
          <Bell className="h-4 w-4" aria-hidden />
          Alert
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-50">경보</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          오퍼링·S-3/F-3 등 지분희석 공시가 나오면 알려 줍니다. 미국 동부 매일 04:00 AM에 무료 발송
          횟수가 리셋됩니다.
        </p>
        {!isPro ? (
          <p className="mt-2 text-xs text-zinc-500">
            무료 · 슬롯 {FREE_ALERT_SLOT_LIMIT}개 · 하루 1회
          </p>
        ) : (
          <p className="mt-2 text-xs text-emerald-400/80">Pro · 슬롯 무제한</p>
        )}
      </header>

      {!authed && !loading ? (
        <p className="mb-4 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-400">
          알람을 저장하려면{" "}
          <Link href="/login?next=/watchman" className="font-medium text-emerald-400 hover:underline">
            로그인
          </Link>
          하세요.
        </p>
      ) : null}

      {error ? (
        <p className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-zinc-500">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={withLiveStatus(alert, isPro)}
              canDelete={isPro && authed}
              busy={busyId === alert.id || missingTable}
              onSelectTicker={(hit: TickerHit) => {
                void patchAlert(alert.id, { ticker: hit.ticker, companyName: hit.name });
              }}
              onToggle={(enabled) => {
                void patchAlert(alert.id, { enabled });
              }}
              onDelete={isPro ? () => void deleteAlert(alert.id) : undefined}
            />
          ))}

          {isPro && visible.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-zinc-800 px-4 py-8 text-center text-sm text-zinc-500">
              아직 알람이 없습니다.
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => void addAlert()}
            disabled={busyId === "new"}
            className="mt-2 inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-600 bg-zinc-900/40 text-sm font-medium text-zinc-200 hover:border-emerald-500/50 hover:bg-zinc-900 hover:text-emerald-300 disabled:opacity-50"
          >
            {busyId === "new" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            새로운 알람 추가
          </button>
        </div>
      )}

      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </div>
  );
}
