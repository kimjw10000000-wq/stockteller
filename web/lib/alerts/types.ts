export type AlertStatus = "watching" | "inactive" | "sent_today";

export type DilutionAlertDto = {
  id: string;
  ticker: string | null;
  companyName: string | null;
  enabled: boolean;
  lastTriggeredAt: string | null;
  createdAt: string;
  status: AlertStatus;
};

export type AlertsPayload = {
  plan: "free" | "pro";
  isPro: boolean;
  slotLimit: number | null;
  alerts: DilutionAlertDto[];
  nextResetAt: string;
  canSendToday: boolean;
};
