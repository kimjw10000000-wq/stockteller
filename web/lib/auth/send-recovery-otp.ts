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

export async function sendRecoveryOtp(email: string): Promise<void> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
  });

  if (error || !data.properties?.email_otp) {
    if (error && isMissingUser(error.message, error.code)) {
      throw new Error("가입된 이메일이 아닙니다.");
    }
    throw new Error(error?.message || "인증번호를 만들지 못했습니다.");
  }

  await sendResendOtpEmail(email, data.properties.email_otp, "recovery");
}
