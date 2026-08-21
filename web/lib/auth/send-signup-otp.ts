import { createAdminClient } from "@/lib/supabase/admin";
import { sendResendOtpEmail } from "@/lib/auth/send-resend-email";

function isMissingUser(message: string, code?: string): boolean {
  const blob = `${code ?? ""} ${message}`.toLowerCase();
  return (
    blob.includes("user_not_found") ||
    blob.includes("not found") ||
    blob.includes("unable to find") ||
    blob.includes("no user")
  );
}

async function generateEmailOtp(email: string): Promise<string> {
  const admin = createAdminClient();
  const first = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (!first.error && first.data.properties?.email_otp) {
    return first.data.properties.email_otp;
  }

  if (first.error && !isMissingUser(first.error.message, first.error.code)) {
    throw new Error(first.error.message || "인증번호를 만들지 못했습니다.");
  }

  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: false,
  });
  if (created.error && !created.error.message.toLowerCase().includes("already")) {
    throw new Error(created.error.message || "계정을 만들지 못했습니다.");
  }

  const second = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const otp = second.data?.properties?.email_otp;
  if (second.error || !otp) {
    throw new Error(second.error?.message || "인증번호를 만들지 못했습니다.");
  }
  return otp;
}

export async function sendSignupOtp(email: string): Promise<void> {
  const otp = await generateEmailOtp(email);
  await sendResendOtpEmail(email, otp, "signup");
}
