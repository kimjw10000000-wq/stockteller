const FROM = process.env.RESEND_FROM?.trim() || "whyup <noreply@whyup.net>";

export async function sendResendOtpEmail(
  email: string,
  otp: string,
  kind: "signup" | "recovery"
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("RESEND_API_KEY가 없습니다. Vercel 환경 변수에 Resend API 키를 넣어 주세요.");
  }

  const isRecovery = kind === "recovery";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [email],
      subject: isRecovery ? "whyup 비밀번호 재설정 인증번호" : "whyup 인증번호",
      html: `<p>${isRecovery ? "비밀번호 재설정" : "회원가입"} 인증번호는 아래와 같습니다.</p><p style="font-size:28px;letter-spacing:6px;font-weight:bold;">${otp}</p><p>잠시 후 만료됩니다. 본인이 요청하지 않았다면 이 메일을 무시하세요.</p>`,
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
