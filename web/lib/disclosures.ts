import type { DisclosureWithStock } from "@/lib/types";
import { createPublicClient } from "@/lib/supabase/public";

export async function listDisclosures(limit = 50): Promise<DisclosureWithStock[]> {
  let supabase;
  try {
    supabase = createPublicClient();
  } catch {
    return [];
  }
  const { data, error } = await supabase
    .from("disclosures")
    .select("*, stocks(name, ticker, sector)")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[listDisclosures]", error.message);
    return [];
  }
  return (data ?? []) as DisclosureWithStock[];
}

export async function getDisclosureById(
  id: string
): Promise<DisclosureWithStock | null> {
  let supabase;
  try {
    supabase = createPublicClient();
  } catch {
    return null;
  }
  const { data, error } = await supabase
    .from("disclosures")
    .select("*, stocks(name, ticker, sector)")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[getDisclosureById]", error.message);
    return null;
  }
  return data as DisclosureWithStock | null;
}
