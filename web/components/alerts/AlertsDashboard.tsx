"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bell, Loader2 } from "lucide-react";
import { ALERT_SLOT_COUNT, FREE_ALERT_SLOT_LIMIT } from "@/lib/alerts/plan";
import { getAlertStatus } from "@/lib/alerts/status";
import type { AlertsPayload, DilutionAlertDto } from "@/lib/alerts/types";
import { AlertCard, EmptySlotCard, LockedSlotCard } from "./AlertCard";
import { TickerSearchModal, type TickerHit } from "./TickerSearchModal";
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

type SearchTarget = { mode: "patch"; id: string } | { mode: "create" };

export function AlertsDashboard() {
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [alerts, setAlerts] = useState<DilutionAlertDto[]>([GUEST_SLOT]);
  const [error, setError] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [searchTarget, setSearchTarget] = useState<SearchTarget | null>(null);
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
      const next = j.alerts.slice(0, ALERT_SLOT_COUNT);
      setAlerts(next.length > 0 ? next : j.isPro ? [] : [GUEST_SLOT]);
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

  async function createAlert(hit: TickerHit) {
    if (!isPro || !authed) {
      setUpgradeOpen(true);
      return;
    }
    setBusyId("new");
    setError(null);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticker: hit.ticker, companyName: hit.name }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        alert?: DilutionAlertDto;
        error?: string;
      };
      if (res.status === 403 || j.error === "upgrade_required") {
        setUpgradeOpen(true);
        return;
      }
      if (res.status === 409) {
        setError("이미 같은 티커 알람이 있습니다.");
        return;
      }
      if (!res.ok || !j.alert) {
        setError("알람을 추가하지 못했습니다.");
        return;
      }
      setAlerts((prev) => [...prev, j.alert!].slice(0, ALERT_SLOT_COUNT));
    } catch {
      setError("알람을 추가하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  function onSelectTicker(hit: TickerHit) {
    if (!searchTarget) return;
    if (searchTarget.mode === "create") {
      void createAlert(hit);
      return;
    }
    void patchAlert(searchTarget.id, { ticker: hit.ticker, companyName: hit.name });
  }

  const filled = (isPro ? alerts : alerts.slice(0, FREE_ALERT_SLOT_LIMIT)).map((a) =>
    withLiveStatus(a, isPro)
  );
  const lockedCount = isPro ? 0 : ALERT_SLOT_COUNT - Math.min(filled.length, FREE_ALERT_SLOT_LIMIT);
  const emptyCount = isPro ? Math.max(0, ALERT_SLOT_COUNT - filled.length) : 0;

  const searchInitial =
    searchTarget?.mode === "patch"
      ? filled.find((a) => a.id === searchTarget.id)?.ticker ?? ""
      : "";

  return (
    <div className="w-full">
      <header className="mb-6 rounded-2xl border-2 border-sky-500 bg-white/85 px-5 py-5 shadow-sm backdrop-blur-sm">
        <p className="flex items-center gap-2 text-sm font-medium text-sky-700">
          <Bell className="h-4 w-4" aria-hidden />
          Alert
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          경보
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500 sm:text-base">
          오퍼링·S-3/F-3 등 지분희석 공시가 나오면 알려 줍니다. 미국 동부 매일 04:00 AM에 무료 발송
          횟수가 리셋됩니다.
        </p>
        {!isPro ? (
          <p className="mt-2 text-xs text-sky-800">
            무료 · 슬롯 {FREE_ALERT_SLOT_LIMIT}/{ALERT_SLOT_COUNT} · 하루 1회
          </p>
        ) : (
          <p className="mt-2 text-xs font-medium text-sky-700">
            Pro · 슬롯 {filled.length}/{ALERT_SLOT_COUNT}
          </p>
        )}
      </header>

      {!authed && !loading ? (
        <p className="mb-4 rounded-xl border-2 border-sky-400 bg-white/85 px-3 py-2 text-sm text-slate-600">
          알람을 저장하려면{" "}
          <Link
            href="/login?next=/watchman"
            className="font-medium text-sky-700 underline-offset-4 hover:underline"
          >
            로그인
          </Link>
          하세요.
        </p>
      ) : null}

      {error ? (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center py-24 text-sky-600">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {filled.map((alert) => (
            <div key={alert.id} className="h-full min-h-[240px]">
              <AlertCard
                alert={alert}
                busy={busyId === alert.id || missingTable}
                onChangeTicker={() => setSearchTarget({ mode: "patch", id: alert.id })}
                onToggle={(enabled) => {
                  void patchAlert(alert.id, { enabled });
                }}
              />
            </div>
          ))}
          {Array.from({ length: emptyCount }).map((_, i) => (
            <div key={`empty-${i}`} className="h-full min-h-[240px]">
              <EmptySlotCard
                busy={busyId === "new"}
                onClick={() => setSearchTarget({ mode: "create" })}
              />
            </div>
          ))}
          {Array.from({ length: lockedCount }).map((_, i) => (
            <div key={`locked-${i}`} className="h-full min-h-[240px]">
              <LockedSlotCard onClick={() => setUpgradeOpen(true)} />
            </div>
          ))}
        </div>
      )}

      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
      <TickerSearchModal
        open={searchTarget != null}
        initialQuery={searchInitial}
        onClose={() => setSearchTarget(null)}
        onSelect={onSelectTicker}
      />
    </div>
  );
}
