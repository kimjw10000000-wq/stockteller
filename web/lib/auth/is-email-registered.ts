import { createAdminClient } from "@/lib/supabase/admin";
import { DUPLICATE_SIGNUP_EMAIL } from "@/lib/auth/validation";

export async function isEmailRegistered(email: string): Promise<boolean> {
  const admin = createAdminClient();
  const normalized = email.trim().toLowerCase();

  const { data: rpcData, error: rpcError } = await admin.rpc("is_email_registered", {
    check_email: normalized,
  });
  if (!rpcError && typeof rpcData === "boolean") {
    return rpcData;
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", normalized)
    .maybeSingle();
  if (profile) return true;

  const { error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: normalized,
  });
  return !error;
}
