import { createAdminClient } from "@/lib/supabase/admin";
import { isEmailRegistered } from "@/lib/auth/is-email-registered";
import { sendResendOtpEmail } from "@/lib/auth/send-resend-email";
import { DUPLICATE_SIGNUP_EMAIL } from "@/lib/auth/validation";

async function generateEmailOtp(email: string): Promise<string> {
  const admin = createAdminClient();
  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: false,
  });
  if (created.error) {
    if (created.error.message.toLowerCase().includes("already")) {
      throw new Error(DUPLICATE_SIGNUP_EMAIL);
    }
    throw new Error(created.error.message || "계정을 만들지 못했습니다.");
  }

  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const otp = link.data?.properties?.email_otp;
  if (link.error || !otp) {
    throw new Error(link.error?.message || "인증번호를 만들지 못했습니다.");
  }
  return otp;
}

export async function sendSignupOtp(email: string): Promise<void> {
  if (await isEmailRegistered(email)) {
    throw new Error(DUPLICATE_SIGNUP_EMAIL);
  }
  const otp = await generateEmailOtp(email);
  await sendResendOtpEmail(email, otp, "signup");
}
