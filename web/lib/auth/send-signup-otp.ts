import { createAdminClient } from "@/lib/supabase/admin";

const FROM = process.env.RESEND_FROM?.trim() || "whyup <noreply@whyup.net>";

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

async function sendResendOtp(email: string, otp: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("RESEND_API_KEY가 없습니다. Vercel 환경 변수에 Resend API 키를 넣어 주세요.");
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [email],
      subject: "whyup 인증번호",
      html: `<p>인증번호는 아래와 같습니다.</p><p style="font-size:28px;letter-spacing:6px;font-weight:bold;">${otp}</p><p>잠시 후 만료됩니다. 본인이 요청하지 않았다면 이 메일을 무시하세요.</p>`,
      text: `인증번호: ${otp}`,
    }),
  });

  if (res.ok) return;

  const body = (await res.json().catch(() => null)) as { message?: string } | null;
  const detail = body?.message || `메일 발송에 실패했습니다. (${res.status})`;
  if (detail.toLowerCase().includes("not verified")) {
    throw new Error("Resend에서 whyup.net 도메인 인증이 끝나지 않았습니다. Domains에서 Verify를 눌러 주세요.");
  }
  throw new Error(detail);
}

export async function sendSignupOtp(email: string): Promise<void> {
  const otp = await generateEmailOtp(email);
  await sendResendOtp(email, otp);
}
