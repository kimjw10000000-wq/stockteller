import type { DisclosureWithStock } from "@/lib/types";

export type MembershipType = "free" | "premium";

export function normalizeMembershipType(raw: string | null | undefined): MembershipType {
  return raw?.trim().toLowerCase() === "premium" ? "premium" : "free";
}

export function getPremiumEmails(): string[] {
  return (process.env.PREMIUM_EMAILS ?? "")
    .split(/[,;\n]+/)
    .map((e) => e.trim().replace(/^["']+|["']+$/g, "").toLowerCase())
    .filter(Boolean);
}

type PremiumUserLike = {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
  app_metadata?: Record<string, unknown> | null;
} | null;

function metadataTier(user: PremiumUserLike): MembershipType | null {
  const um = user?.user_metadata?.membership_tier;
  const am = user?.app_metadata?.membership_tier;
  if (typeof um === "string" && um.toLowerCase() === "premium") return "premium";
  if (typeof am === "string" && am.toLowerCase() === "premium") return "premium";
  return null;
}

/** 유료 회원 여부 — PREMIUM_EMAILS 또는 Supabase user metadata */
export function isPremiumUser(user: PremiumUserLike): boolean {
  if (!user) return false;
  if (metadataTier(user) === "premium") return true;
  const email = user.email?.trim().toLowerCase();
  if (!email) return false;
  return getPremiumEmails().includes(email);
}

export function disclosureMembershipType(item: DisclosureWithStock): MembershipType {
  if (item.membership_type) return normalizeMembershipType(item.membership_type);
  const meta = item.gemini_metadata?.membership_type;
  if (typeof meta === "string") return normalizeMembershipType(meta);
  return "free";
}

export function isPremiumDisclosure(item: DisclosureWithStock): boolean {
  return disclosureMembershipType(item) === "premium";
}

export function canViewDisclosureBody(
  item: DisclosureWithStock,
  user: PremiumUserLike
): boolean {
  if (!isPremiumDisclosure(item)) return true;
  return isPremiumUser(user);
}
