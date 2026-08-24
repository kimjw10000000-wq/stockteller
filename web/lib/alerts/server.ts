import type { SupabaseClient } from "@supabase/supabase-js";
import { getAlertStatus } from "./status";
import { parseBillingPlan, type BillingPlan } from "./plan";
import type { DilutionAlertDto } from "./types";

export type DilutionAlertRow = {
  id: string;
  user_id: string;
  ticker: string | null;
  company_name: string | null;
  enabled: boolean;
  last_triggered_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function getUserBillingPlan(
  supabase: SupabaseClient,
  userId: string
): Promise<BillingPlan> {
  const { data, error } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return parseBillingPlan((data as { plan?: string } | null)?.plan);
}

export function mapAlertRow(
  row: DilutionAlertRow,
  isPro: boolean,
  now: Date = new Date()
): DilutionAlertDto {
  return {
    id: row.id,
    ticker: row.ticker,
    companyName: row.company_name,
    enabled: row.enabled,
    lastTriggeredAt: row.last_triggered_at,
    createdAt: row.created_at,
    status: getAlertStatus({
      enabled: row.enabled,
      ticker: row.ticker,
      isPro,
      lastTriggeredAt: row.last_triggered_at,
      now,
    }),
  };
}

export async function listAlertRows(
  supabase: SupabaseClient,
  userId: string
): Promise<DilutionAlertRow[]> {
  const { data, error } = await supabase
    .from("dilution_alerts")
    .select(
      "id,user_id,ticker,company_name,enabled,last_triggered_at,created_at,updated_at"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as DilutionAlertRow[]) ?? [];
}

export async function ensureFreeAlertSlot(
  supabase: SupabaseClient,
  userId: string,
  rows: DilutionAlertRow[]
): Promise<DilutionAlertRow[]> {
  if (rows.length > 0) return rows;
  const { data, error } = await supabase
    .from("dilution_alerts")
    .insert({
      user_id: userId,
      ticker: null,
      company_name: null,
      enabled: false,
    })
    .select(
      "id,user_id,ticker,company_name,enabled,last_triggered_at,created_at,updated_at"
    )
    .single();
  if (error) {
    const again = await listAlertRows(supabase, userId);
    if (again.length > 0) return again;
    throw new Error(error.message);
  }
  return [data as DilutionAlertRow];
}

export function normalizeTicker(raw: string): string {
  return raw.trim().toUpperCase().replace(/\./g, "-");
}
