"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";
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
  const { t } = useI18n();
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
      const res = await fetch("/api/alerts");
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
        setError("alerts.tableMissing");
        return;
      }
      if (!res.ok) {
        setError("alerts.loadFailed");
        return;
      }
      setAuthed(true);
      setMissingTable(false);
      setIsPro(j.isPro);
      const next = j.alerts.slice(0, ALERT_SLOT_COUNT);
      setAlerts(next.length > 0 ? next : j.isPro ? [] : [GUEST_SLOT]);
    } catch {
      setError("alerts.loadFailed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const tmr = window.setInterval(() => {
      setAlerts((prev) => prev.map((a) => withLiveStatus(a, isPro)));
    }, 30_000);
    return () => window.clearInterval(tmr);
  }, [isPro]);

  const patchAlert = useCallback(
    async (id: string, body: Record<string, unknown>) => {
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
          setError("alerts.tickerRequired");
          return;
        }
        if (res.status === 409) {
          setError("alerts.duplicateTicker");
          return;
        }
        if (!res.ok || !j.alert) {
          setError("alerts.saveFailed");
          return;
        }
        setAlerts((prev) => prev.map((a) => (a.id === id ? j.alert! : a)));
      } catch {
        setError("alerts.saveFailed");
      } finally {
        setBusyId(null);
      }
    },
    [authed]
  );

  const createAlert = useCallback(
    async (hit: TickerHit) => {
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
          setError("alerts.duplicateTicker");
          return;
        }
        if (!res.ok || !j.alert) {
          setError("alerts.addFailed");
          return;
        }
        setAlerts((prev) => [...prev, j.alert!].slice(0, ALERT_SLOT_COUNT));
      } catch {
        setError("alerts.addFailed");
      } finally {
        setBusyId(null);
      }
    },
    [isPro, authed]
  );

  const onSelectTicker = useCallback(
    (hit: TickerHit) => {
      if (!searchTarget) return;
      if (searchTarget.mode === "create") {
        void createAlert(hit);
        return;
      }
      void patchAlert(searchTarget.id, { ticker: hit.ticker, companyName: hit.name });
    },
    [searchTarget, createAlert, patchAlert]
  );

  const onChangeTicker = useCallback((id: string) => {
    setSearchTarget({ mode: "patch", id });
  }, []);

  const onToggle = useCallback(
    (id: string, enabled: boolean) => {
      void patchAlert(id, { enabled });
    },
    [patchAlert]
  );

  const onCloseSearch = useCallback(() => setSearchTarget(null), []);
  const onCloseUpgrade = useCallback(() => setUpgradeOpen(false), []);
  const onOpenUpgrade = useCallback(() => setUpgradeOpen(true), []);
  const onCreateSlot = useCallback(() => setSearchTarget({ mode: "create" }), []);

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
          {t("alerts.kicker")}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          {t("alerts.title")}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500 sm:text-base">
          {t("alerts.lead")}
        </p>
        {!isPro ? (
          <p className="mt-2 text-xs text-sky-800">
            {t("alerts.freeMeta", { used: FREE_ALERT_SLOT_LIMIT, total: ALERT_SLOT_COUNT })}
          </p>
        ) : (
          <p className="mt-2 text-xs font-medium text-sky-700">
            {t("alerts.proMeta", { used: filled.length, total: ALERT_SLOT_COUNT })}
          </p>
        )}
      </header>

      {!authed && !loading ? (
        <p className="mb-4 rounded-xl border-2 border-sky-400 bg-white/85 px-3 py-2 text-sm text-slate-600">
          {t("alerts.loginPromptBefore")}{" "}
          <Link
            href="/login?next=/watchman"
            prefetch
            className="font-medium text-sky-700 underline-offset-4 hover:underline"
          >
            {t("alerts.loginPromptLink")}
          </Link>
          {t("alerts.loginPromptAfter")}
        </p>
      ) : null}

      {error ? (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {t(error)}
        </p>
      ) : null}

      {loading ? (
        <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4" aria-hidden>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="min-h-[240px] animate-pulse rounded-2xl border-2 border-sky-300/70 bg-white/50"
            />
          ))}
        </div>
      ) : (
        <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {filled.map((alert) => (
            <div key={alert.id} className="h-full min-h-[240px]">
              <AlertCard
                alert={alert}
                busy={busyId === alert.id || missingTable}
                onChangeTicker={() => onChangeTicker(alert.id)}
                onToggle={(enabled) => onToggle(alert.id, enabled)}
              />
            </div>
          ))}
          {Array.from({ length: emptyCount }).map((_, i) => (
            <div key={`empty-${i}`} className="h-full min-h-[240px]">
              <EmptySlotCard busy={busyId === "new"} onClick={onCreateSlot} />
            </div>
          ))}
          {Array.from({ length: lockedCount }).map((_, i) => (
            <div key={`locked-${i}`} className="h-full min-h-[240px]">
              <LockedSlotCard onClick={onOpenUpgrade} />
            </div>
          ))}
        </div>
      )}

      <UpgradeModal open={upgradeOpen} onClose={onCloseUpgrade} />
      <TickerSearchModal
        open={searchTarget != null}
        initialQuery={searchInitial}
        onClose={onCloseSearch}
        onSelect={onSelectTicker}
      />
    </div>
  );
}
